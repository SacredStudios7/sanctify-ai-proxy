require('dotenv').config();

// Validate environment variables on startup
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ CRITICAL: OPENAI_API_KEY environment variable is not set');
  process.exit(1);
}

const fastify = require('fastify')({ 
  logger: true,
  trustProxy: true 
});

// Register CORS
fastify.register(require('@fastify/cors'), {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS']
});

// Rate limiting configuration - 20 requests per 2 minutes
const RATE_LIMITS = {
  windowMs: 2 * 60 * 1000, // 2 minutes
  maxRequests: 20, // 20 requests per window
  dailyLimit: 75, // 75 requests per day
  dailyCostLimit: 700 // $7.00 daily cost limit (in cents)
};

// In-memory rate limiting store
const rateLimitStore = new Map(); // Format: userId -> { windowStart, requests, dailyRequests, dailyCost }

/**
 * Check and update rate limits for a user
 */
function checkRateLimit(userId) {
  const now = Date.now();
  const windowStart = Math.floor(now / RATE_LIMITS.windowMs) * RATE_LIMITS.windowMs;
  const dailyStart = Math.floor(now / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
  
  const userKey = userId || 'anonymous';
  let userData = rateLimitStore.get(userKey) || {
    windowStart: 0,
    requests: 0,
    dailyStart: 0,
    dailyRequests: 0,
    dailyCost: 0
  };
  
  // Reset window if it's a new time window
  if (windowStart > userData.windowStart) {
    userData.windowStart = windowStart;
    userData.requests = 0;
  }
  
  // Reset daily counters if it's a new day
  if (dailyStart > userData.dailyStart) {
    userData.dailyStart = dailyStart;
    userData.dailyRequests = 0;
    userData.dailyCost = 0;
  }
  
  console.log(`📊 Rate limit check for ${userKey}:`);
  console.log(`   Window: ${userData.requests}/${RATE_LIMITS.maxRequests} requests`);
  console.log(`   Daily: ${userData.dailyRequests}/${RATE_LIMITS.dailyLimit} requests, $${userData.dailyCost/100} cost`);
  
  // Check per-minute rate limit
  if (userData.requests >= RATE_LIMITS.maxRequests) {
    const remainingTime = Math.ceil((windowStart + RATE_LIMITS.windowMs - now) / 1000);
    console.log(`🚫 BLOCKING REQUEST: Rate limit exceeded (${userData.requests + 1} > ${RATE_LIMITS.maxRequests})`);
    return {
      allowed: false,
      error: `You're sending messages too quickly! Please wait ${Math.ceil(remainingTime/60)} minutes before trying again.`,
      rateLimitExceeded: true,
      retryAfter: remainingTime
    };
  }
  
  // Check daily request limit
  if (userData.dailyRequests >= RATE_LIMITS.dailyLimit) {
    console.log(`🚫 BLOCKING REQUEST: Daily limit exceeded (${userData.dailyRequests + 1} > ${RATE_LIMITS.dailyLimit})`);
    return {
      allowed: false,
      error: `You've reached your daily message limit of ${RATE_LIMITS.dailyLimit} requests. Please come back tomorrow!`,
      dailyLimitExceeded: true
    };
  }
  
  // Check daily cost limit (estimate ~9 cents per request)
  const estimatedCost = 9; // cents per request
  if (userData.dailyCost + estimatedCost > RATE_LIMITS.dailyCostLimit) {
    console.log(`🚫 BLOCKING REQUEST: Daily cost limit exceeded ($${(userData.dailyCost + estimatedCost)/100} > $${RATE_LIMITS.dailyCostLimit/100})`);
    return {
      allowed: false,
      error: `Daily usage limit reached. Please come back tomorrow!`,
      dailyLimitExceeded: true
    };
  }
  
  // Increment counters
  userData.requests++;
  userData.dailyRequests++;
  userData.dailyCost += estimatedCost;
  
  // Store updated data
  rateLimitStore.set(userKey, userData);
  
  console.log(`✅ Request allowed. New counts: ${userData.requests}/${RATE_LIMITS.maxRequests} window, ${userData.dailyRequests}/${RATE_LIMITS.dailyLimit} daily`);
  
  return { allowed: true };
}

// Cleanup old rate limit data every hour
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  for (const [userId, userData] of rateLimitStore.entries()) {
    // Remove data older than 1 hour and not from today
    if (userData.windowStart < oneHourAgo && userData.dailyStart < oneHourAgo) {
      rateLimitStore.delete(userId);
      console.log(`🧹 Cleaned up old rate limit data for user: ${userId}`);
    }
  }
  
  console.log(`🧹 Rate limit cleanup completed. Active users: ${rateLimitStore.size}`);
}, 60 * 60 * 1000); // Run every hour

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    rateLimiting: {
      enabled: true,
      activeUsers: rateLimitStore.size,
      windowMs: RATE_LIMITS.windowMs,
      maxRequests: RATE_LIMITS.maxRequests,
      dailyLimit: RATE_LIMITS.dailyLimit
    }
  };
});

// Rate limit status endpoint for debugging
fastify.get('/rate-limit-status/:userId?', async (request, reply) => {
  const userId = request.params.userId || 'anonymous';
  const userData = rateLimitStore.get(userId);
  
  if (!userData) {
    return {
      userId,
      status: 'No rate limit data',
      limits: RATE_LIMITS
    };
  }
  
  const now = Date.now();
  const windowTimeLeft = Math.max(0, (userData.windowStart + RATE_LIMITS.windowMs - now) / 1000);
  const dailyTimeLeft = Math.max(0, (userData.dailyStart + 24*60*60*1000 - now) / 1000);
  
  return {
    userId,
    currentWindow: {
      requests: userData.requests,
      maxRequests: RATE_LIMITS.maxRequests,
      timeLeftSeconds: Math.ceil(windowTimeLeft)
    },
    daily: {
      requests: userData.dailyRequests,
      maxRequests: RATE_LIMITS.dailyLimit,
      cost: userData.dailyCost,
      maxCost: RATE_LIMITS.dailyCostLimit,
      timeLeftSeconds: Math.ceil(dailyTimeLeft)
    },
    limits: RATE_LIMITS
  };
});

// AI Chat endpoint - optimized for speed
fastify.post('/ai/chat', async (request, reply) => {
  const requestStart = Date.now();
  
  try {
    console.log('🎯 NEW REQUEST RECEIVED');
    console.log('📋 Request body type:', typeof request.body);
    console.log('📋 Request body keys:', request.body ? Object.keys(request.body) : 'none');
    
    // Enhanced input validation
    if (!request.body) {
      console.error('❌ No request body provided');
      return reply.code(400).send({ error: 'Request body is required' });
    }
    
    const { message, conversationHistory = [], topic, userId } = request.body;
    
    // Input validation first
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.code(400).send({ 
        error: 'Message is required and must be a non-empty string' 
      });
    }
    
    // Rate limiting check
    const rateLimitResult = checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
      const statusCode = rateLimitResult.rateLimitExceeded ? 429 : 402;
      return reply.code(statusCode).send({
        error: rateLimitResult.error,
        rateLimitExceeded: rateLimitResult.rateLimitExceeded,
        dailyLimitExceeded: rateLimitResult.dailyLimitExceeded,
        retryAfter: rateLimitResult.retryAfter
      });
    }
    
    let finalTopic = 'conversational'; // Default
    
    try {
      // Auto-detect different request types
      const prayerCreationKeywords = ['create a prayer', 'make a prayer', 'write a prayer', 'create me a prayer', 'create me an', 'write me a prayer', 'make me a prayer', 'generate a prayer', 'help me pray'];
      const informationalKeywords = [
        // Direct questions
        'what is', 'what does', 'what are', 'what will', 'what happens', 'what happened',
        'who is', 'who was', 'who are', 'where is', 'where does', 'when did', 'when will',
        'how is', 'how does', 'why is', 'why does', 'why did',
        // Educational requests
        'explain', 'define', 'tell me about', 'what\'s the meaning', 'what means',
        'what\'s the difference', 'difference between',
        // Bible-specific questions
        'where in the bible', 'where does the bible', 'what verse', 'which verse',
        'scripture says', 'bible verse about', 'biblical', 'according to scripture',
        'give me a passage', 'give me a verse', 'show me a verse', 'find me a verse',
        'give me a random', 'random verse', 'random passage', 'any verse', 'share a verse',
        'passage from', 'verse from', 'scripture from', 'bible passage about',
        // Theological questions (often structured as "do/does/will/can" questions)
        'do my', 'does my', 'will my', 'can my', 'do i get', 'does god', 'will god',
        'is it true', 'is there', 'are there', 'do we go', 'will we go', 'can we',
        'am i saved', 'are we saved', 'do good deeds', 'does faith', 'will jesus'
      ];
      
      const safeMessage = (message || '').toLowerCase();
    
    // Detect explicit prayer creation requests
    const isPrayerCreationRequest = prayerCreationKeywords.some(keyword => 
      safeMessage.includes(keyword.toLowerCase())
    );
    
    // Detect any prayer request (broader detection)
    const containsPrayer = safeMessage.includes('prayer') || safeMessage.includes('pray');
    const isNotInformational = !safeMessage.includes('what is prayer') && !safeMessage.includes('explain prayer') && !safeMessage.includes('define prayer') && !safeMessage.includes('what does prayer') && !safeMessage.includes('what is pray');
    
    const isPrayerRequest = isPrayerCreationRequest || (containsPrayer && isNotInformational);
    
    const isInformationalRequest = informationalKeywords.some(keyword => 
      safeMessage.includes(keyword.toLowerCase())
    );
    
              // Detect if user needs practical help (contextual analysis)
    const needsHelpIndicators = [
      'i need', 'i keep', 'i cant', 'i can\'t', 'i dont', 'i don\'t', 'i struggle', 'i\'m struggling', 
      'help me', 'struggling with', 'dealing with', 'having trouble', 'keep falling', 'keep failing',
      'dont know what to do', 'don\'t know what to do', 'need guidance', 'need advice', 'need help',
      'falling into', 'addicted to', 'overcome', 'stop doing', 'break free', 'get rid of'
    ];
    
    const spiritualStruggles = [
      'sin', 'lust', 'temptation', 'anxiety', 'depression', 'fear', 'worry', 'anger', 'pride',
      'addiction', 'doubt', 'faith', 'prayer', 'bible', 'god', 'jesus', 'spiritual', 'christian'
    ];
    
    const indicatesNeedForHelp = needsHelpIndicators.some(indicator => safeMessage.includes(indicator));
    const isSpiritualContext = spiritualStruggles.some(struggle => safeMessage.includes(struggle));
    
    // Check if message is casual/conversational (very restrictive now)
    const casualWords = ['hi', 'hello', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'no', 'good', 'great', 'awesome', 'cool', 'nice', 'wow', 'amen', 'bless', 'ke', 'k', 'lol', 'haha'];
    const containsCasualWord = casualWords.some(word => safeMessage.includes(word));
    const isVeryShortMessage = safeMessage.length < 6;
    const isSingleWord = !safeMessage.includes(' ') && safeMessage.length < 8;
    
    // Only consider casual if it's VERY clearly casual AND not a spiritual need
    const isCasualMessage = (isVeryShortMessage || containsCasualWord || isSingleWord) && !indicatesNeedForHelp && !isSpiritualContext;
    
    console.log(`🔍 MESSAGE ANALYSIS DEBUG:`);
    console.log(`   Message: "${safeMessage}" (length: ${safeMessage.length})`);
    console.log(`   Prayer request: ${isPrayerRequest}`);
    console.log(`   Informational request: ${isInformationalRequest}`);
    console.log(`   Contextual analysis:`);
    console.log(`     - Indicates need for help: ${indicatesNeedForHelp}`);
    console.log(`     - Spiritual context: ${isSpiritualContext}`);
    console.log(`     - Contains casual word: ${containsCasualWord}`);
    console.log(`     - Very short message: ${isVeryShortMessage}`);
    console.log(`     - Final casual result: ${isCasualMessage}`);
    console.log(`   -> Will prioritize PRACTICAL for users expressing spiritual needs`);
    
    if (isPrayerRequest) {
      finalTopic = 'prayer';
    } else if (isInformationalRequest) {
      finalTopic = 'informational';
    } else if (isCasualMessage) {
      finalTopic = 'conversational';
    } else {
      finalTopic = 'practical'; // Default to practical for any spiritual/Christian questions
    }
    
    console.log(`🎯 FINAL TOPIC SELECTED: "${finalTopic}"`);
    console.log(`📋 FORMAT EXPLANATION:`);
    if (finalTopic === 'prayer') {
      console.log(`   → PRAYER: Opening + 2 paragraphs + "In Jesus' name, Amen"`);
    } else if (finalTopic === 'informational') {
      console.log(`   → INFORMATIONAL: 3 short educational paragraphs with biblical context`);
    } else if (finalTopic === 'conversational') {
      console.log(`   → CONVERSATIONAL: 1-3 brief, friendly sentences`);
    } else if (finalTopic === 'practical') {
      console.log(`   → PRACTICAL: 5 numbered principles with verses and actions`);
    }
    
    } catch (detectionError) {
      console.error('❌ Error in message detection:', detectionError);
      console.error('❌ Detection error stack:', detectionError.stack);
      // Default to conversational format if detection fails
      finalTopic = 'conversational';
    }
    
    if (message.length > 1500) {
      return reply.code(400).send({ 
        error: 'Message too long (max 1500 characters)' 
      });
    }
    
    // Check OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      fastify.log.error('OpenAI API key not configured');
      return reply.code(500).send({ 
        error: 'AI service not configured' 
      });
    }
    
    // Validate API key format
    if (!openaiApiKey.startsWith('sk-')) {
      fastify.log.error('Invalid OpenAI API key format');
      return reply.code(500).send({ 
        error: 'AI service misconfigured' 
      });
    }
    
    fastify.log.info(`🚀 AI Request: "${message.substring(0, 50)}..."`);
    
    // Prepare conversation history for better context (keep recent messages)
    const conversationLength = (conversationHistory || []).length;
    
    // Keep recent history for context as requested
    let recentHistory = (conversationHistory || []).slice(-8).map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    fastify.log.info(`📚 Using conversation history: ${conversationLength} total messages, keeping ${recentHistory.length} recent messages for context`);
    
    // Build spiritual guidance system prompt
    const systemPrompt = buildSpiritualPrompt(finalTopic);
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: message }
    ];
    
    fastify.log.info(`🚀 Calling OpenAI with ${messages.length} messages`);
    
    // Call OpenAI with optimized parameters for speed
    const openaiStart = Date.now();
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages,
          max_tokens: 800, // Increased to ensure 5 full principles fit
          temperature: 0.4, // Lowered for better structure adherence
          top_p: 0.9,
          frequency_penalty: 0.1, // Reduced to allow for more detailed explanations
          presence_penalty: 0.2 // Increased to encourage new topics/principles
        }),
      });
      fastify.log.info(`📡 OpenAI API call completed in ${Date.now() - openaiStart}ms`);
    } catch (fetchError) {
      fastify.log.error(`❌ OpenAI API fetch error:`, fetchError);
      throw new Error(`OpenAI API call failed: ${fetchError.message}`);
    }
    
    const networkTime = Date.now() - openaiStart;
    
    if (!response.ok) {
      const errorText = await response.text();
      fastify.log.error(`OpenAI API error: ${response.status} - ${errorText}`);
      return reply.code(500).send({ 
        error: 'AI service temporarily unavailable' 
      });
    }
    
    // Parse response
    const parseStart = Date.now();
    let data;
    try {
      data = await response.json();
      fastify.log.info(`✅ Response parsed successfully`);
    } catch (parseError) {
      fastify.log.error(`❌ Error parsing OpenAI response:`, parseError);
      throw new Error(`Response parsing failed: ${parseError.message}`);
    }
    const parseTime = Date.now() - parseStart;
    
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      fastify.log.error('❌ No content in OpenAI response:', data);
      return reply.code(500).send({ 
        error: 'No response generated' 
      });
    }
    
    fastify.log.info(`✅ Content extracted, length: ${content.length}`);
    
    
    // Performance timing
    const totalTime = Date.now() - requestStart;
    
    fastify.log.info(`⚡ TIMING - Network: ${networkTime}ms, Parse: ${parseTime}ms, Total: ${totalTime}ms`);
    
    // Parse and structure the response
    let structuredResponse;
    try {
      structuredResponse = parseAIResponse(content);
      fastify.log.info(`✅ Response structured successfully`);
    } catch (structureError) {
      fastify.log.error(`❌ Error structuring response:`, structureError);
      // Return basic response if structuring fails
      structuredResponse = {
        content: content.trim(),
        verseReferences: [],
        contentType: 'spiritual_guidance',
        formattedAt: new Date().toISOString()
      };
    }
    
    return reply.send({
      ...structuredResponse,
      performance: {
        networkTime,
        parseTime,
        totalTime
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const totalTime = Date.now() - requestStart;
    console.error('🚨 CRITICAL ERROR IN AI CHAT ENDPOINT');
    console.error('🚨 Error type:', error.constructor.name);
    console.error('🚨 Error message:', error.message);
    console.error('🚨 Error stack:', error.stack);
    console.error('🚨 Request details:');
    console.error('   - Message:', message);
    console.error('   - Topic:', topic);
    console.error('   - Final topic:', finalTopic);
    console.error('   - History length:', conversationHistory?.length || 0);
    console.error('   - Total time:', totalTime + 'ms');
    
    fastify.log.error(`Error in AI chat (${totalTime}ms):`, error);
    
    return reply.code(500).send({ 
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
      details: error.message
    });
  }
});

// Updated prompt with navy styling and full verse text requirement
function buildSpiritualPrompt(topic) {
  // Use the same dual-format prompt for all topics
  return `You are a Christian chatbot designed to provide structured, biblically grounded responses to users seeking spiritual guidance, answers, or prayer. Your response format depends on the user's request type and must follow one of the two formats below:

---

1️⃣ FOR QUESTIONS OR DEVOTIONAL ANSWERS:
Use this structure when the user asks questions like 'Do I need God?', 'What is Psalms about?', or 'How do I get closer to God?'

- Begin with a soft, welcoming introductory paragraph (2–4 sentences)
  - Acknowledge the user's question
  - Mention God and Scripture
  - Gently lead into the points that follow

- Then list **5 to 7 numbered points**, each formatted like this:
  - **Bold the entire point title**, e.g., **1. Obedience:**
  - Start each point with 1-2 opening sentences that explain or introduce the concept/topic of that point
  - Then include a relevant Bible verse with the **full text of the verse quoted directly** 
  - When referencing a Bible verse, write it like this EXACT format: "As Jesus reminds us in John 14:15, 'If you love me, keep my commands.' This shows us that..."
  - The verse reference (John 14:15) should appear in bold navy styling within the sentence
  - After you write the verse reference and quote, continue with your explanation - DO NOT repeat the reference
  - Each point must be 3–5 sentences total (opening + verse + explanation)
  - ABSOLUTELY FORBIDDEN: Adding (John 14:15) or any verse reference at the end of the paragraph
  - Do not use quote blocks, sub-points, or stylized breaks

- End with a closing paragraph:
  - Reassure the user of God's presence, love, or faithfulness
  - Encourage continued prayer, reflection, or study
  - Optionally end with a short blessing like: "May you find peace and guidance in your journey to grow closer to Him."

Tone: Devotional, warm, Scripture-centered, and easy to understand
Formatting: Bolded point headers, bold navy verse references, full verse text embedded directly

---

2️⃣ FOR PRAYER REQUESTS (e.g., 'Can you write me a prayer for peace?'):
Use this format only when the user asks for a prayer:

- Begin with a short, warm sentence like:
  - "Of course, it's a beautiful thing to pray for peace. Here's a prayer you might use or adapt:"
  - Or: "Certainly. Prayer is a powerful way to connect with God. Here's one you can reflect on:"

- Then provide a full paragraph-style prayer with these characteristics:
  - Prayer starts with "Dear Heavenly Father," or similar reverent address
  - May include 1 relevant Bible verse, embedded naturally into the prayer text
  - When including a verse, write it like this EXACT format: "As you promise in Psalm 23:4, 'Even though I walk through the darkest valley, I will fear no evil, for you are with me.' Help me to..."
  - The verse reference (Psalm 23:4) should appear in bold navy styling within the sentence
  - After writing the verse reference and quote, continue the prayer - DO NOT repeat the reference
  - ABSOLUTELY FORBIDDEN: Adding (Psalm 23:4) or any verse reference at the end
  - Do not use bullet points, numbers, or broken-up formatting
  - Prayer should flow gently in 2–5 paragraphs
  - End with: "In Jesus' name, I pray. Amen."

Tone: Gentle, trusting, peaceful, and reverent
Formatting: Full paragraph prayer with embedded full Bible verse and styled bold navy reference — never markdown asterisks

---

Always determine the correct format based on whether the user is:
- Asking a biblical question or seeking devotional understanding → Use Format 1 (devotional layout)
- Asking for a prayer → Use Format 2 (prayer layout)

Never mix the two formats. Keep responses scriptural, encouraging, and devotional in tone. Always reflect Christ's love, truth, and peace in your answers.

CRITICAL FORMATTING RULE: When you reference a Bible verse, include it ONLY ONCE within the natural flow of your sentence. DO NOT add the verse reference again at the end of the paragraph or sentence. 

EXAMPLE OF CORRECT FORMAT:
"As Jesus said in John 14:6, 'I am the way and the truth and the life.' This verse shows us..."

EXAMPLE OF FORBIDDEN FORMAT (DO NOT DO THIS):
"As Jesus said in John 14:6, 'I am the way and the truth and the life.' (John 14:6)."

ABSOLUTELY DO NOT add parenthetical verse references at the end of sentences or paragraphs. The verse reference should appear ONLY ONCE in the middle of the sentence when introducing the quote.

CRITICAL: Do not use parentheses around verse references like (John 3:16). Do not add verse references at the end of paragraphs. Each verse should be referenced exactly once when you introduce the quote, and never repeated.`;
}

// Topic-specific guidance
function getTopicGuidance(topic) {
  const topicMap = {
    'finding-peace': 'Focus on biblical peace, anxiety relief, and trusting God. Use Philippians 4:6-7, Matthew 6:25-34.',
    'life-guidance': 'Emphasize seeking God\'s will, wisdom, and direction. Include Proverbs 3:5-6, James 1:5.',
    'prayer-life': 'Focus on prayer, communion with God, and spiritual disciplines. Use Matthew 6:9-13, 1 Thessalonians 5:17.',
    'bible-study': 'Emphasize Scripture study, meditation, and application. Include 2 Timothy 3:16-17, Joshua 1:8.',
    'purpose-calling': 'Focus on God\'s purpose, calling, and identity in Christ. Use Jeremiah 29:11, Ephesians 2:10.',
    'forgiveness': 'Emphasize forgiveness, grace, and healing. Include Matthew 6:14-15, 1 John 1:9.',
    'relationships': 'Focus on biblical relationships, love, and community. Use 1 Corinthians 13, Ephesians 4:32.',
    'struggles': 'Emphasize God\'s strength in weakness and perseverance. Use 2 Corinthians 12:9, Romans 8:28.',
    'gratitude': 'Focus on thankfulness, praise, and recognizing God\'s blessings. Use 1 Thessalonians 5:18, Psalm 103.',
    'prayer': 'CRITICAL: This is a PRAYER REQUEST - DO NOT USE NUMBERED PRINCIPLES FORMAT. ONLY use prayer format: [Opening sentence introducing the prayer] + [First prayer paragraph - 3-4 sentences addressing the main request] + [Second prayer paragraph - 3-4 sentences with thanksgiving/blessings] + End with "In Jesus\' name, Amen." NO NUMBERED SECTIONS, NO VERSE REFERENCES, NO SCRIPTURE CITATIONS.'
  };
  
  return topicMap[topic] || '';
}

// Parse AI response for structured content
function parseAIResponse(content) {
  // Since verse references are now embedded within the text content as styled navy blue text,
  // we no longer need to extract them separately to avoid duplication
  return {
    content: content.trim(),
    verseReferences: [], // Always empty since verses are embedded in content
    contentType: 'spiritual_guidance',
    formattedAt: new Date().toISOString()
  };
}

// Start the server
const start = async () => {
  try {
    const port = process.env.PORT || 3001;
    const host = process.env.HOST || '0.0.0.0';
    
    console.log('🔧 Starting Sanctify AI Proxy...');
    console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Present' : 'Missing'}`);
    console.log(`📡 Port: ${port}, Host: ${host}`);
    
    await fastify.listen({ port: parseInt(port), host });
    
    console.log('✅ Server started successfully!');
    fastify.log.info(`🚀 Sanctify AI Proxy running on ${host}:${port}`);
    fastify.log.info(`🔗 Health check: http://${host}:${port}/health`);
    fastify.log.info(`🤖 AI endpoint: http://${host}:${port}/ai/chat`);
    
  } catch (err) {
    console.error('❌ Error starting server:', err);
    fastify.log.error('Error starting server:', err);
    process.exit(1);
  }
};

start(); 
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

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
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
    
    const { message, conversationHistory = [], topic } = request.body;
    
    // Input validation first
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.code(400).send({ 
        error: 'Message is required and must be a non-empty string' 
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
    
    } catch (detectionError) {
      console.error('❌ Error in message detection:', detectionError);
      console.error('❌ Detection error stack:', detectionError.stack);
      // Default to conversational format if detection fails
      finalTopic = 'conversational';
    }
    
    if (message.length > 2000) {
      return reply.code(400).send({ 
        error: 'Message too long (max 2000 characters)' 
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
    
    fastify.log.info(`🚀 AI Request: "${message.substring(0, 50)}..."`);
    
    // NUCLEAR FORMAT PROTECTION: Clear ALL history after EVERY request to prevent any degradation
    const conversationLength = (conversationHistory || []).length;
    
    // ALWAYS clear history - no exceptions, no conditions
    let recentHistory = [];
    
    fastify.log.info(`🧹 NUCLEAR RESET: Clearing ALL conversation history (length: ${conversationLength}) to ensure format consistency`);
    
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
          temperature: 0.7, // Slightly lower for more focused responses
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

// Simple prompt that works
function buildSpiritualPrompt(topic) {
  if (topic === 'prayer') {
    return `CRITICAL: This is a PRAYER REQUEST - Write ONLY a prayer in this exact format:

[One opening sentence about the prayer topic]

[First prayer paragraph - speak directly to God]

[Second prayer paragraph - continue speaking to God]

In Jesus' name, Amen.

FORBIDDEN: Do NOT use numbered lists, principles, or practical steps. This must be a flowing prayer speaking TO God, not about God.`;
  }
  
  if (topic === 'informational') {
    return `Provide a clear, educational explanation in exactly 3 paragraphs:

1. First paragraph: Direct answer and basic definition/explanation
2. Second paragraph: Biblical context and relevant Scripture references  
3. Third paragraph: Significance and why this matters for Christians today

Format: Write naturally flowing paragraphs. Include relevant Bible verses naturally within the text. No numbered lists, no practical steps, no action items - just clear, informative explanation.

Keep it educational and informative, not prescriptive.`;
  }
  
  if (topic === 'conversational') {
    return `Respond naturally and conversationally with a warm, friendly, spiritual tone. Keep it brief and appropriate to what the user said:

- For greetings: Respond warmly with a blessing
- For casual comments: Acknowledge and encourage  
- For typos/unclear: Gently ask for clarification
- For general chat: Be supportive and spiritually encouraging
- For thanks: Accept graciously and give glory to God

Write 1-3 short sentences maximum. Be natural, not formal. Show God's love through your response.`;
  }
  
  // Default to practical format for guidance requests
  return `Provide exactly 5 numbered principles with proper spacing. Each principle must follow this EXACT format:

[Encouraging opening sentence]

1. **Title**: Explanation. The Bible says, "Quote" (Verse). Action.

2. **Title**: Explanation. The Bible says, "Quote" (Verse). Action.

3. **Title**: Explanation. The Bible says, "Quote" (Verse). Action.

4. **Title**: Explanation. The Bible says, "Quote" (Verse). Action.

5. **Title**: Explanation. The Bible says, "Quote" (Verse). Action.

[Encouraging conclusion paragraph]

CRITICAL SPACING: Each numbered principle MUST be separated by a blank line. Do not run principles together.

CRITICAL: NEVER write "Action step:" - make the action flow naturally after the verse.

Use varied action starters: Try, Begin, Practice, Focus on, Start, Take time to, Make it a habit to, Commit to, Choose to, etc.

FORBIDDEN: Never use "Action step:", "Practical step:", or any labels before actions.`;
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
  // Extract verse references - comprehensive matching for all formats and contexts
  const versePatterns = [
    // Standard format: "Book Chapter:Verse"
    /(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalm|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation)\s+\d+:\d+(?:-\d+)?/gi,
    // Parenthetical format: "(Book Chapter:Verse)"
    /\((?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalm|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation)\s+\d+:\d+(?:-\d+)?\)/gi
  ];
  
  let allMatches = [];
  versePatterns.forEach(pattern => {
    const matches = content.match(pattern) || [];
    allMatches = allMatches.concat(matches);
  });
  
  const verseReferences = allMatches.map(match => {
    // Clean up parentheses if present
    const cleanMatch = match.replace(/[()]/g, '');
    const parts = cleanMatch.split(/\s+/);
    if (parts.length >= 2) {
      const verseRef = parts[parts.length - 1];
      const book = parts.slice(0, -1).join(' ');
      if (verseRef.includes(':')) {
        return { book, reference: verseRef, fullReference: cleanMatch };
      }
    }
    return null;
  }).filter(Boolean);
  
  // Remove duplicates
  const uniqueVerses = verseReferences.filter((verse, index, self) => 
    index === self.findIndex(v => v.fullReference === verse.fullReference)
  );

  return {
    content: content.trim(),
    verseReferences: uniqueVerses,
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
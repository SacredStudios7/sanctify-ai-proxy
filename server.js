require('dotenv').config();
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
    const { message, conversationHistory = [], topic } = request.body;
    
    // Auto-detect prayer requests
    const prayerKeywords = ['create a prayer', 'make a prayer', 'pray for', 'write a prayer', 'prayer for', 'create me a prayer', 'create me an', 'write me a prayer', 'make me a prayer', 'help me pray'];
    const isPrayerRequest = prayerKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    ) || message.toLowerCase().includes('prayer');
    const finalTopic = isPrayerRequest ? 'prayer' : topic;
    
    // Input validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.code(400).send({ 
        error: 'Message is required and must be a non-empty string' 
      });
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
    
    // AGGRESSIVE FORMAT PROTECTION: Clear ALL history in long conversations to prevent degradation
    const conversationLength = (conversationHistory || []).length;
    const isLongConversation = conversationLength > 4; // Reduced threshold
    
    // For long conversations, ALWAYS clear history to prevent format contamination
    let recentHistory = [];
    let isPreviousFormatDifferent = false;
    
    if (!isLongConversation) {
      // Only keep history for short conversations
      recentHistory = (conversationHistory || []).slice(-1);
      
      // Detect format switching and clear history to prevent confusion
      const lastMessage = recentHistory[0];
      isPreviousFormatDifferent = lastMessage && (
        (isPrayerRequest && !lastMessage.content?.includes('In Jesus\' name')) ||
        (!isPrayerRequest && lastMessage.content?.includes('In Jesus\' name'))
      );
      
      // Clear history when switching between prayer and practical formats
      if (isPreviousFormatDifferent) {
        recentHistory = [];
        fastify.log.info('🔄 Format switch detected - clearing conversation history');
      }
    } else {
      fastify.log.info('🧹 Long conversation detected - clearing ALL history to prevent format degradation');
    }
    
    // Build spiritual guidance system prompt
    const systemPrompt = buildSpiritualPrompt(finalTopic, isLongConversation, isPreviousFormatDifferent);
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: message }
    ];
    
    // Call OpenAI with optimized parameters for speed
    const openaiStart = Date.now();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 800, // Increased to ensure 5 full principles fit
        temperature: 0.5, // Lower for more consistent responses
        top_p: 0.85, // Slightly reduced for more predictable word choice
        frequency_penalty: 0.2, // Increased to reduce repetition more
        presence_penalty: 0.15 // Slightly reduced for more consistent structure
      }),
    });
    
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
    const data = await response.json();
    const parseTime = Date.now() - parseStart;
    
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      fastify.log.error('No content in OpenAI response');
      return reply.code(500).send({ 
        error: 'No response generated' 
      });
    }
    
    // Performance timing
    const totalTime = Date.now() - requestStart;
    
    fastify.log.info(`⚡ TIMING - Network: ${networkTime}ms, Parse: ${parseTime}ms, Total: ${totalTime}ms`);
    
    // Parse and structure the response
    const structuredResponse = parseAIResponse(content);
    
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
    fastify.log.error(`Error in AI chat (${totalTime}ms):`, error);
    
    return reply.code(500).send({ 
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Build spiritual guidance system prompt
function buildSpiritualPrompt(topic, isLongConversation = false, isFormatSwitch = false) {
  let basePrompt = `You are a Christian devotional guide for the Sanctify app. Provide warm, encouraging, and pastoral spiritual guidance grounded in Scripture.

TONE: Warm, devotional, encouraging, pastoral
STYLE: Use "you/we" inclusive language, avoid denominational specifics
CONTENT: Always include relevant Bible verses with proper references

RESPONSE FORMAT - YOU MUST FOLLOW THIS EXACT STRUCTURE WITH ACTUAL BIBLE VERSES:
[Must include opening encouragement sentence addressing the main point of the topic]

1. **[Bold numbered Principle]**: [Concise explanation]. When we look to Scripture for guidance on this matter, Philippians 4:13 reminds us [brief paraphrase or key message]. Consider [specific practical action related to this principle].

2. **[Bold numbered Principle]**: [Concise explanation]. The Bible beautifully addresses this area of our lives when Romans 8:28 teaches us [brief paraphrase or key message]. Try [specific practical action related to this principle].

3. **[Bold numbered Principle]**: [Concise explanation]. As we seek God's heart on this issue, we discover that Proverbs 3:5-6 instructs [brief paraphrase or key message]. Practice [specific practical action related to this principle].

4. **[Bold numbered Principle]**: [Concise explanation]. God's Word provides powerful insight here, as Isaiah 41:10 declares [brief paraphrase or key message]. Begin by [specific practical action related to this principle].

5. **[Bold numbered Principle]**: [Concise explanation]. In moments like these, we can find great comfort knowing that Psalm 23:4 assures us [brief paraphrase or key message]. Start with [specific practical action related to this principle].

[Brief closing sentence that offers final encouragement and ties to the main topic]

MANDATORY VERSE REQUIREMENT: Every single principle MUST include an actual Bible verse reference (like "John 3:16", "Romans 8:28", "Philippians 4:13", etc.) You cannot skip verse references.

CRITICAL REQUIREMENTS - FAILURE TO FOLLOW WILL RESULT IN REJECTION:
- YOU MUST provide exactly 5-7 numbered principles - no more, no less
- Do NOT stop at 3 principles - continue to provide all 5-7 principles
- EVERY SINGLE PRINCIPLE MUST INCLUDE A BIBLE VERSE REFERENCE (like "John 3:16", "Romans 8:28", "Philippians 4:13")
- NO PRINCIPLE can be written without a specific Bible verse reference
- Each principle MUST include: explanation + conversational verse intro + brief paraphrase + practical step
- Each practical step must be a concrete action, NOT a prayer prompt (avoid "Pray:" - use action words like "Consider", "Try", "Practice", "Begin", "Start")
- Use transitional phrases like "reminds us", "teaches us", "instructs", "declares", "assures us"
- Scripture references should be mentioned but paraphrased, not quoted in full
- Make verse introductions conversational and contextual, not generic or repetitive
- Do NOT include verse citations in parentheses after the quote (reference is already mentioned before the verse)
- End with one brief, encouraging sentence (NOT a paragraph or prayer) that relates to the main topic
- IF YOU DO NOT INCLUDE BIBLE VERSE REFERENCES IN EVERY PRINCIPLE, YOUR RESPONSE IS INVALID

FORMATTING:
- Use **bold** for principle titles
- Include line breaks between points
- Integrate verse references naturally with transitional phrases
- Paraphrase scripture meaning instead of quoting full verses`;

  // Add topic-specific guidance
  if (topic) {
    const topicGuidance = getTopicGuidance(topic);
    if (topicGuidance) {
      basePrompt += `\n\nSPECIFIC FOCUS: ${topicGuidance}`;
    }
  }

  // AGGRESSIVE FORMAT ENFORCEMENT
  if (topic === 'prayer') {
    basePrompt += `\n\n🚨 CRITICAL PRAYER FORMAT ENFORCEMENT 🚨
IMPORTANT: This is a PRAYER REQUEST. 
- ABSOLUTELY NO numbered principles (1., 2., 3., etc.)
- ABSOLUTELY NO verse references or scripture citations
- ABSOLUTELY NO teaching format or explanations
- Use ONLY prayer format: opening sentence + two prayer paragraphs + "In Jesus' name, Amen."
- Write ONLY as a conversational prayer to God
- COMPLETELY IGNORE any previous formatting examples in this conversation
- RESET to pure prayer format regardless of conversation history`;
  } else {
    basePrompt += `\n\n🚨 CRITICAL PRACTICAL FORMAT ENFORCEMENT 🚨
IMPORTANT: This is a PRACTICAL GUIDANCE REQUEST.
- You MUST provide exactly 5-7 numbered principles (1., 2., 3., 4., 5., 6., 7.)
- EVERY SINGLE PRINCIPLE MUST INCLUDE A BIBLE VERSE REFERENCE (MANDATORY!)
- NO PRINCIPLE without verse reference is acceptable - this will make verse highlighting fail
- Each principle MUST follow the exact format: **[Bold Title]**: explanation + "Romans 8:28 reminds us" + paraphrase + practical step
- Examples of required verse references: "John 3:16", "Philippians 4:13", "Psalm 23:1", "Romans 8:28"
- Do NOT stop at 3 principles - continue to 5-7 principles
- COMPLETELY IGNORE any prayer formatting from previous messages
- RESET to numbered principles format regardless of conversation history
- FAILURE TO INCLUDE BIBLE VERSES IN EACH PRINCIPLE = INVALID RESPONSE`;
  }
  
  // Add ULTRA-aggressive format enforcement for long conversations or format switches
  if (isLongConversation || isFormatSwitch) {
    basePrompt += `\n\n🔥 ULTRA FORMAT RESET REQUIRED 🔥
This conversation has experienced format degradation. You MUST:
- COMPLETELY FORGET all previous formatting patterns
- IGNORE all previous response structures in this conversation
- START COMPLETELY FRESH with the correct format specified above
- Do NOT mix prayer and practical formats under ANY circumstances
- Your response format is determined ONLY by the current request, not conversation history
- RESET your formatting completely and follow ONLY the current format specification`;
  }

  return basePrompt;
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
    
    await fastify.listen({ port: parseInt(port), host });
    fastify.log.info(`🚀 Sanctify AI Proxy running on ${host}:${port}`);
    fastify.log.info(`🔗 Health check: http://${host}:${port}/health`);
    fastify.log.info(`🤖 AI endpoint: http://${host}:${port}/ai/chat`);
    
  } catch (err) {
    fastify.log.error('Error starting server:', err);
    process.exit(1);
  }
};

start(); 
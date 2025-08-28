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
    // Enhanced input validation
    if (!request.body) {
      return reply.code(400).send({ error: 'Request body is required' });
    }
    
    const { message, conversationHistory = [], topic } = request.body;
    
    // Auto-detect prayer requests with safety checks
    const prayerKeywords = ['create a prayer', 'make a prayer', 'pray for', 'write a prayer', 'prayer for', 'create me a prayer', 'create me an', 'write me a prayer', 'make me a prayer', 'help me pray'];
    const safeMessage = (message || '').toLowerCase();
    const isPrayerRequest = prayerKeywords.some(keyword => 
      safeMessage.includes(keyword.toLowerCase())
    ) || safeMessage.includes('prayer');
    const finalTopic = isPrayerRequest ? 'prayer' : (topic || 'general');
    
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
    isPreviousFormatDifferent = lastMessage && lastMessage.content && (
      (isPrayerRequest && !lastMessage.content.includes('In Jesus\' name')) ||
      (!isPrayerRequest && lastMessage.content.includes('In Jesus\' name'))
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
        temperature: 0.7, // Slightly lower for more focused responses
        top_p: 0.9,
        frequency_penalty: 0.1, // Reduced to allow for more detailed explanations
        presence_penalty: 0.2 // Increased to encourage new topics/principles
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
    fastify.log.error(`Error stack:`, error.stack);
    fastify.log.error(`Message:`, message);
    fastify.log.error(`Topic:`, topic);
    fastify.log.error(`Conversation history length:`, conversationHistory?.length || 0);
    
    return reply.code(500).send({ 
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
      details: error.message
    });
  }
});

// Build spiritual guidance system prompt
function buildSpiritualPrompt(topic, isLongConversation = false, isFormatSwitch = false) {
  // CLEAN BASE PROMPT - Simple and effective
  let basePrompt = `You are a warm, encouraging Christian spiritual guide. Provide biblical wisdom in a clear, structured format.`;

  if (topic === 'prayer') {
    basePrompt += `

THIS IS A PRAYER REQUEST:
Write a conversational prayer with:
- Opening sentence introducing the prayer
- Two paragraphs of prayer (3-4 sentences each)
- End with "In Jesus' name, Amen."
- NO numbered points, NO verse references, NO teaching format`;
  } else {
    basePrompt += `

THIS IS A PRACTICAL GUIDANCE REQUEST:

YOU MUST COPY THIS EXACT FORMAT. DO NOT DEVIATE:

[Opening sentence]

1. **Title**: Explanation. John 3:16 says, "Quote." Action.
2. **Title**: Explanation. Romans 8:28 says, "Quote." Action.  
3. **Title**: Explanation. Philippians 4:13 says, "Quote." Action.
4. **Title**: Explanation. Psalm 23:1 says, "Quote." Action.
5. **Title**: Explanation. Proverbs 3:5 says, "Quote." Action.

CRITICAL: Every principle MUST use "[Verse] says, 'Quote.'" - NO other words like "reminds", "states", "teaches", "instructs". ONLY "says".`;
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
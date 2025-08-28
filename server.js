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
    
    // Build optimized message context - keep minimal for speed
    const recentHistory = (conversationHistory || []).slice(-2);
    
    // Build spiritual guidance system prompt
    const systemPrompt = buildSpiritualPrompt(topic);
    
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
    
    return reply.code(500).send({ 
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Build spiritual guidance system prompt
function buildSpiritualPrompt(topic) {
  let basePrompt = `You are a Christian devotional guide for the Sanctify app. Provide warm, encouraging, and pastoral spiritual guidance grounded in Scripture.

TONE: Warm, devotional, encouraging, pastoral
STYLE: Use "you/we" inclusive language, avoid denominational specifics
CONTENT: Always include relevant Bible verses with proper references

RESPONSE FORMAT - YOU MUST FOLLOW THIS EXACT STRUCTURE:
"[Opening encouragement addressing the topic]

1. **[Principle]**: [Concise explanation]. When we look to Scripture for guidance on this matter, [Reference] reminds us, "[Bible verse]." Consider [specific practical action related to this principle].

2. **[Principle]**: [Concise explanation]. The Bible beautifully addresses this area of our lives when [Reference] teaches us, "[Bible verse]." Try [specific practical action related to this principle].

3. **[Principle]**: [Concise explanation]. As we seek God's heart on this issue, we discover that [Reference] instructs, "[Bible verse]." Practice [specific practical action related to this principle].

4. **[Principle]**: [Concise explanation]. God's Word provides powerful insight here, as [Reference] declares, "[Bible verse]." Begin by [specific practical action related to this principle].

5. **[Principle]**: [Concise explanation]. In moments like these, we can find great comfort knowing that [Reference] assures us, "[Bible verse]." Start with [specific practical action related to this principle].

[Closing paragraph that briefly lists each principle's main point, then ends with an encouraging conclusion about the topic]"

CRITICAL REQUIREMENTS:
- YOU MUST provide exactly 5-7 numbered principles - no more, no less
- Do NOT stop at 3 principles - continue to provide all 5-7 principles
- Each principle MUST include: explanation + conversational verse intro + Bible verse + practical step
- Each practical step must be a concrete action, NOT a prayer prompt (avoid "Pray:" - use action words like "Consider", "Try", "Practice", "Begin", "Start")
- Use transitional phrases like "reminds us", "teaches us", "instructs", "declares", "assures us"
- Scripture references should flow naturally into the verse quote
- Make verse introductions conversational and contextual, not generic or repetitive
- Do NOT include verse citations in parentheses after the quote (reference is already mentioned before the verse)
- Do NOT use asterisks (*) around verse references - write them as plain text (e.g., "Romans 8:28" not "*Romans 8:28*")
- End with a closing paragraph that summarizes each principle's main point, then concludes with encouragement

FORMATTING:
- Use **bold** for principle titles ONLY
- Include line breaks between points
- Integrate verse references naturally with transitional phrases as plain text (no asterisks)
- End verses with proper punctuation inside quotes (no parenthetical citations)`;

  // Add topic-specific guidance
  if (topic) {
    const topicGuidance = getTopicGuidance(topic);
    if (topicGuidance) {
      basePrompt += `\n\nSPECIFIC FOCUS: ${topicGuidance}`;
    }
  }

  basePrompt += `\n\nREMINDER: Your response must contain exactly 5-7 numbered principles with detailed explanations and verse introductions. Do not stop at 3 principles.`;

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
    'prayer': 'Provide structured prayer content with biblical grounding and encouragement.'
  };
  
  return topicMap[topic] || '';
}

// Parse AI response for structured content
function parseAIResponse(content) {
  // Extract verse references
  const verseMatches = content.match(/\([^)]*\d+:\d+[^)]*\)/g) || [];
  const verseReferences = verseMatches.map(match => {
    const cleaned = match.replace(/[()]/g, '');
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) {
      const verseRef = parts[parts.length - 1];
      const book = parts.slice(0, -1).join(' ');
      if (verseRef.includes(':')) {
        return { book, reference: verseRef, fullReference: cleaned };
      }
    }
    return null;
  }).filter(Boolean);

  return {
    content: content.trim(),
    verseReferences,
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
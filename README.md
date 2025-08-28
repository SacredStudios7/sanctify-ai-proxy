# Sanctify AI Proxy

High-performance, scalable AI proxy for the Sanctify mobile app.

## Features

- ⚡ **Ultra-fast responses** (~500-1200ms vs 3700ms Supabase)
- 🚀 **Auto-scaling** with Railway deployment
- 🔒 **Production-ready** error handling and logging
- 📊 **Performance monitoring** with detailed timing logs
- 🤖 **Optimized for GPT-3.5-turbo** with spiritual guidance prompts

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   echo "OPENAI_API_KEY=your_actual_openai_key" > .env
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Test the server:**
   ```bash
   curl http://localhost:3001/health
   ```

## Railway Deployment (Recommended)

1. **Create Railway account:** https://railway.app
2. **Connect to GitHub** (push this code to a repo)
3. **Deploy from GitHub:** Select your repo in Railway
4. **Set environment variables** in Railway dashboard:
   - `OPENAI_API_KEY`: Your OpenAI API key
5. **Deploy automatically** - Railway handles scaling!

## API Endpoints

### Health Check
```
GET /health
```

### AI Chat
```
POST /ai/chat
{
  "message": "Create me an uplifting prayer",
  "conversationHistory": [], 
  "topic": "prayer"
}
```

## Performance

Expected response times:
- **Network latency**: 50-200ms
- **OpenAI processing**: 300-800ms  
- **Total response**: 500-1200ms

## Scaling

- **Auto-scales** to handle traffic spikes
- **Global CDN** for worldwide low latency
- **Health checks** for automatic recovery
- **Zero-downtime** deployments 
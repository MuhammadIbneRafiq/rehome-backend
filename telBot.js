import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dotenv from 'dotenv';
import SearchHistory from './searchHistory.js';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

console.log(TELEGRAM_BOT_TOKEN);
console.log(GROQ_API_KEY);
// IP Rotation configuration
const PROXY_LIST = [
  // Using direct connection for now (no proxy)
  'direct',
  // Add real proxy URLs here when available:
  // 'http://your-proxy-service.com:8080',
  // 'http://another-proxy.com:3128',
];

let currentProxyIndex = 0;

class ProxyRotator {
  constructor(proxies) {
    this.proxies = proxies;
    this.currentIndex = 0;
    this.failedProxies = new Set();
  }

  getNextProxy() {
    // Skip failed proxies
    let attempts = 0;
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      
      if (!this.failedProxies.has(proxy)) {
        return proxy;
      }
      attempts++;
    }
    
    // If all proxies failed, reset and try again
    this.failedProxies.clear();
    return this.proxies[0];
  }

  markProxyAsFailed(proxy) {
    this.failedProxies.add(proxy);
  }

  createAxiosInstance(proxy) {
    const config = {
      timeout: 30000,
      headers: {
        'User-Agent': this.getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        // Add the WAF session cookie
        'Cookie': 'awswaf_session_storage=5c2609d5-c2b9-416a-9e05-f1064de9ead0:CQoAm88FoXJ0AAAA:liufq/rN4JMfyLa9h8u4O3jcm+HfXv3VpA1y5dRt96gxgvU3kzOzIaG0tXFeeYJvfVJZ22S3iLsYDUbEKIK9GBpPnph9Ww5lo5z/uBVPITmd5qCE4f4ATxAxMPU3ukh117RLR6MCz0cCwOAWSIZil1NgWgm2IEP8Hj16zv4vOa0J/EvMv8eb5Y0lh+kK1Jv2uN3FQAN7sZVFGD4DdlzVTl4GDH05qC2mg6P8eAAeoA1QLdGrVrLprif1CZ4mxsin6Hn9tL5492i9zVFS+mJRuMO+BIjlYbLwZtldS1lLJIPojQrE9guDmQfHF9IMkurFGlym14fFmeOGMXJ5EqpDiufX/H3Ur7rdLnGsOVQCBjRaFsAy4vwhDD9vPt+LCLFzUUI7DuM17qy7A37hMhkAUWPFrAfsBEdyt4Gban0CME4Ls+TgX63JCl9wi7kLBxXb13xfVNqEPapatKjlCLTv9SrVf6JGEeALJMKri2C8wneKAs/gkjnKq9192FlggTxC+PfMOvOF9NL0ZS3lxuI3TcESjjyN3mN7ePg5B2FJQ38hAXMWjFrdgTVhRPxRb9Q1YMyxnYfSlqw/eqXrlmIg9fbUNQbOKQctSSinrdoJ8P/RWIACkB/UO7EQJApb1RfQTt1ipFhCZFK01gfH/pJbrhjBai/rkZAUvgmIE7hN3S4OvOunT6UJlHAGZeQORBnD22tcHIjqMuUSHZNhkRv0lManGaXcyvPqeSxiKBaskqKzV3BdBZzp1vMGEKAIB94Q+jEcJBEYzsTf9rNFzJvwSyruLjBGb7sjjEd1T6yMWfyvqOP2jcP/tBaBmcwlL2Bja6BQmhCLWqddslTf3OoFWkSrciEiXxKuXQd9HKjd4VOaGlhQ/jgJJPfZZhil/8uxXne2ljr9CGFCx5GeFzDaZ4P0CiLz6aWDfxODOlj2ta3yRw/qJJqAvj3zDBoWY55SUtuUixC0A2VuAEvw3AIY6DSZWiXgMWZUmeqxfQhmCGfBJQQNkW60nBnCA3jTYVdqw9IrbeRu7sQYcOowdmvKfLNYG0XVSo5u+6RLTIWwYKZbO2mFnKfPSXWBO/JiMojJoqE9NeNW+2ksr6bVG9YsSC6z5rlF35wzDlsxAh73ckpKM2YNeLAVlbUjDvalaKLo13/VRICsCMiXi9YOZT3fVJJ+Z40Ix4l1EtdviqgXe0oPT/39R17ijG5yncUTRpsKbHnz'
      }
    };

    if (proxy && proxy !== 'direct') {
      config.httpsAgent = new HttpsProxyAgent(proxy);
      config.proxy = false; // Disable default proxy to use httpsAgent
    }

    return axios.create(config);
  }

  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
}

// Initialize proxy rotator
const proxyRotator = new ProxyRotator([...PROXY_LIST, 'direct']); // 'direct' means no proxy
const searchHistory = new SearchHistory(); // Initialize search history

// Initialize bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Utility function to add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to translate text using Groq API
async function translateWithGroq(text, targetLang = 'en') {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: `Translate the following Dutch text to ${targetLang}: "${text}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 512,
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Translation error:', error.message);
    return text; // Return original text if translation fails
  }
}

// Function to fetch Marktplaats listings with IP rotation
async function fetchMarktplaatsListings(searchQuery = 'gratis', maxRetries = 3) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    const proxy = proxyRotator.getNextProxy();
    const axiosInstance = proxyRotator.createAxiosInstance(proxy);
    
    try {
             console.log(`Attempt ${attempt + 1}: Using proxy ${proxy}`);
       
       // Try multiple URL formats like in test-bot.js (updated 2024)
       const urls = [
         // Modern search formats
         `https://www.marktplaats.nl/q/${encodeURIComponent(searchQuery)}/`,
         `https://www.marktplaats.nl/q/${encodeURIComponent(searchQuery)}`,
         `https://www.marktplaats.nl/l/${encodeURIComponent(searchQuery)}/`,
         `https://www.marktplaats.nl/l/${encodeURIComponent(searchQuery)}`,
         // Legacy search formats
         `https://www.marktplaats.nl/l/zoeken.html?query=${encodeURIComponent(searchQuery)}`,
         `https://www.marktplaats.nl/l/zoeken/?query=${encodeURIComponent(searchQuery)}`,
         `https://www.marktplaats.nl/l/zoeken?query=${encodeURIComponent(searchQuery)}`,
         `https://www.marktplaats.nl/l/zoeken/?q=${encodeURIComponent(searchQuery)}`,
         `https://www.marktplaats.nl/l/zoeken/`,
         `https://www.marktplaats.nl/`,
       ];
       
       let response;
       let workingUrl;
       
       // Try each URL until one works
       for (const url of urls) {
         try {
           console.log(`Trying: ${url}`);
           response = await axiosInstance.get(url);
           
           if (response.status === 200) {
             console.log(`✅ Success with: ${url}`);
             workingUrl = url;
             break;
           }
         } catch (error) {
           console.log(`❌ Failed: ${url} - ${error.message}`);
         }
       }
       
       if (!response || response.status !== 200) {
         throw new Error('All URLs failed');
       }
      
             const $ = cheerio.load(response.data);
       const listings = [];
       
       // Extract listings from the new 2024 structure
       $('.hz-Listing-item-wrapper').each((i, wrapper) => {
         const $wrapper = $(wrapper);
         const $title = $wrapper.find('h3.hz-Listing-title');
         const $link = $wrapper.find('a.hz-Listing-coverLink');
         const $description = $wrapper.find('p.hz-Listing-description');
         
         const title = $title.text().trim();
         const href = $link.attr('href');
         const description = $description.text().trim();
         
         if (title && href && !listings.some(l => l.title === title)) {
           listings.push({
             title,
             url: href.startsWith('http') ? href : `https://www.marktplaats.nl${href}`,
             description: description || 'No description',
             source: 'marktplaats'
           });
         }
       });
       
       if (listings.length > 0) {
         console.log(`✅ Found ${listings.length} listings using the new structure!`);
       }
       
       if (listings.length === 0) {
         console.log('⚠️  No listings found with any selector');
         // For debugging - let's see what we got
         console.log(`Response size: ${response.data.length} characters`);
         console.log(`Working URL was: ${workingUrl}`);
       }
             
       console.log(`🎉 Successfully fetched ${listings.length} listings using proxy ${proxy}`);
       
       // Save search to history
       const searchMetadata = {
         proxy: proxy,
         responseSize: response.data.length,
         workingUrl: workingUrl,
         attempt: attempt + 1,
         totalUrls: urls.length
       };
       
       await searchHistory.saveSearch(searchQuery, listings, searchMetadata);
       
       return listings.slice(0, 10); // Return first 10 results
      
    } catch (error) {
      console.error(`Request failed with proxy ${proxy}:`, error.message);
      proxyRotator.markProxyAsFailed(proxy);
      attempt++;
      
      if (attempt < maxRetries) {
        await delay(2000 * attempt); // Exponential backoff
      }
    }
  }
  
  throw new Error('All proxy attempts failed');
}

// Bot message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;
  
  console.log(`Received message from ${chatId}: ${userText}`);
  
  try {
    // Check if user wants to search Marktplaats
    if (userText.toLowerCase().includes('/search') || userText.toLowerCase().includes('marktplaats')) {
      await bot.sendMessage(chatId, '🔍 Searching Marktplaats with IP rotation...');
      
      // Extract search query from message
      const searchQuery = userText.replace(/\/(search|marktplaats)/gi, '').trim() || 'gratis';
      
      try {
        const listings = await fetchMarktplaatsListings(searchQuery);
        
        if (listings.length > 0) {
          await bot.sendMessage(chatId, `Found ${listings.length} listings for "${searchQuery}":`);
          
          for (const listing of listings) {
            // Translate the listing title
            const translatedTitle = await translateWithGroq(listing.title, 'English');
            
            const message = `
🏷️ **Original**: ${listing.title}
🌐 **Translated**: ${translatedTitle}
🔗 **Link**: ${listing.url}
            `;
            
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            await delay(1000); // Delay between messages to avoid spam
          }
        } else {
          await bot.sendMessage(chatId, `No listings found for "${searchQuery}"`);
        }
        
      } catch (error) {
        console.error('Scraping error:', error);
        await bot.sendMessage(chatId, 'Sorry, I encountered an error while searching Marktplaats. Please try again later.');
      }
      
    } else {
      // Regular chat with Groq API
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that can search Marktplaats (Dutch marketplace) and translate content. When users ask about searching, suggest they use "/search [query]" or mention "marktplaats" in their message.'
            },
            {
              role: 'user',
              content: userText
            }
          ],
          temperature: 0.7,
          max_tokens: 512,
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const aiReply = response.data.choices[0].message.content;
      await bot.sendMessage(chatId, aiReply);
    }
    
  } catch (error) {
    console.error('Bot error:', error);
    await bot.sendMessage(chatId, "Sorry, I couldn't process your request. Please try again.");
  }
});

// Bot commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
🤖 **Welcome to ReHome Marktplaats Bot!**

I can help you:
• Search Marktplaats listings with IP rotation
• Translate Dutch listings to English
• Browse saved search history
• Chat using AI

**Commands:**
• \`/search [query]\` - Search Marktplaats
• \`/history\` - View recent searches
• \`/stats\` - Search statistics
• \`/filter [query]\` - Filter saved listings
• \`/help\` - Show this help message
• Just mention "marktplaats" in your message to search

**Example:**
\`/search gratis meubels\`
\`/filter furniture\`
or
\`marktplaats free furniture\`
  `;
  
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
📚 **Help - ReHome Marktplaats Bot**

**Features:**
• IP rotation for web scraping
• Automatic translation of Dutch listings
• Search history storage and filtering
• AI-powered chat responses with access to search history

**Search Commands:**
• \`/search furniture\` - Search for furniture
• \`/search gratis\` - Search for free items
• \`marktplaats bikes\` - Search for bikes

**History Commands:**
• \`/history\` - View recent 10 searches
• \`/stats\` - View search statistics
• \`/filter furniture\` - Find saved listings containing "furniture"
• \`/analyze [query]\` - AI analysis of search history

**IP Rotation:**
This bot uses IP rotation to avoid being blocked while scraping. It automatically switches between different proxy servers and user agents.
  `;
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// History command - show recent searches
bot.onText(/\/history/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const recentSearches = await searchHistory.getRecentSearches(10);
    
    if (recentSearches.length === 0) {
      await bot.sendMessage(chatId, '📭 No search history found. Try searching for something first!');
      return;
    }
    
    let historyMessage = '📋 **Recent Searches:**\n\n';
    
    recentSearches.forEach((search, index) => {
      const date = new Date(search.timestamp).toLocaleDateString();
      const time = new Date(search.timestamp).toLocaleTimeString();
      historyMessage += `${index + 1}. **"${search.query}"** (${search.totalResults} results)\n`;
      historyMessage += `   📅 ${date} ${time}\n`;
      historyMessage += `   🔗 ${search.metadata.workingUrl}\n\n`;
    });
    
    await bot.sendMessage(chatId, historyMessage, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('History command error:', error);
    await bot.sendMessage(chatId, 'Sorry, I couldn\'t retrieve search history.');
  }
});

// Stats command - show search statistics
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const stats = await searchHistory.getStats();
    
    if (stats.totalSearches === 0) {
      await bot.sendMessage(chatId, '📊 No statistics available yet. Try searching for something first!');
      return;
    }
    
    let statsMessage = '📊 **Search Statistics:**\n\n';
    statsMessage += `🔍 **Total Searches:** ${stats.totalSearches}\n`;
    statsMessage += `📦 **Total Listings Found:** ${stats.totalListings}\n`;
    statsMessage += `📊 **Average Results per Search:** ${stats.averageResultsPerSearch}\n\n`;
    
    if (stats.mostPopularQueries.length > 0) {
      statsMessage += '🔥 **Most Popular Queries:**\n';
      stats.mostPopularQueries.forEach((query, index) => {
        statsMessage += `${index + 1}. "${query.query}" (${query.count} times)\n`;
      });
      statsMessage += '\n';
    }
    
    if (stats.newestSearch && stats.oldestSearch) {
      const newest = new Date(stats.newestSearch).toLocaleDateString();
      const oldest = new Date(stats.oldestSearch).toLocaleDateString();
      statsMessage += `📅 **Search Period:** ${oldest} - ${newest}`;
    }
    
    await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Stats command error:', error);
    await bot.sendMessage(chatId, 'Sorry, I couldn\'t retrieve statistics.');
  }
});

// Filter command - search through saved listings
bot.onText(/\/filter (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const filterQuery = match[1];
  
  try {
    await bot.sendMessage(chatId, `🔍 Filtering saved listings for "${filterQuery}"...`);
    
    const matchingSearches = await searchHistory.searchHistory(filterQuery);
    
    if (matchingSearches.length === 0) {
      await bot.sendMessage(chatId, `No saved listings found containing "${filterQuery}"`);
      return;
    }
    
    // Collect all matching listings
    const allMatchingListings = [];
    matchingSearches.forEach(search => {
      search.results.forEach(listing => {
        if (listing.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
            (listing.description && listing.description.toLowerCase().includes(filterQuery.toLowerCase()))) {
          allMatchingListings.push({
            ...listing,
            searchQuery: search.query,
            searchDate: search.timestamp
          });
        }
      });
    });
    
    // Remove duplicates based on URL
    const uniqueListings = allMatchingListings.filter((listing, index, self) =>
      index === self.findIndex(l => l.url === listing.url)
    );
    
    await bot.sendMessage(chatId, `Found ${uniqueListings.length} unique listings containing "${filterQuery}":`);
    
    // Show first 5 results
    const showListings = uniqueListings.slice(0, 5);
    
    for (const listing of showListings) {
      const translatedTitle = await translateWithGroq(listing.title, 'English');
      const searchDate = new Date(listing.searchDate).toLocaleDateString();
      
      const message = `
🏷️ **Original:** ${listing.title}
🌐 **Translated:** ${translatedTitle}
🔍 **Found in search:** "${listing.searchQuery}" (${searchDate})
🔗 **Link:** ${listing.url}
      `;
      
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      await delay(1000);
    }
    
    if (uniqueListings.length > 5) {
      await bot.sendMessage(chatId, `... and ${uniqueListings.length - 5} more results. Use a more specific filter to narrow down.`);
    }
    
  } catch (error) {
    console.error('Filter command error:', error);
    await bot.sendMessage(chatId, 'Sorry, I couldn\'t filter the search history.');
  }
});

// Analyze command - AI analysis of search history
bot.onText(/\/analyze(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const analysisQuery = match[1] ? match[1].trim() : '';
  
  try {
    await bot.sendMessage(chatId, '🤖 Analyzing search history with AI...');
    
    const recentSearches = await searchHistory.getRecentSearches(20);
    const stats = await searchHistory.getStats();
    
    if (recentSearches.length === 0) {
      await bot.sendMessage(chatId, 'No search history to analyze yet!');
      return;
    }
    
    // Prepare data for AI analysis
    const searchSummary = recentSearches.map(search => ({
      query: search.query,
      results: search.totalResults,
      date: search.timestamp
    }));
    
    const prompt = analysisQuery 
      ? `Analyze this search history data and specifically answer: "${analysisQuery}"\n\nSearch History:\n${JSON.stringify(searchSummary, null, 2)}\n\nStatistics:\n${JSON.stringify(stats, null, 2)}`
      : `Analyze this Marktplaats search history data. Provide insights about search patterns, popular items, and recommendations:\n\nSearch History:\n${JSON.stringify(searchSummary, null, 2)}\n\nStatistics:\n${JSON.stringify(stats, null, 2)}`;
    
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that analyzes Marktplaats (Dutch marketplace) search data. Provide helpful insights, patterns, and recommendations based on search history.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const analysis = response.data.choices[0].message.content;
    await bot.sendMessage(chatId, `🔍 **AI Analysis:**\n\n${analysis}`, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Analyze command error:', error);
    await bot.sendMessage(chatId, 'Sorry, I couldn\'t analyze the search history.');
  }
});

// Error handling
bot.on('error', (error) => {
  console.error('Bot error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});

console.log('🤖 ReHome Marktplaats Bot started with IP rotation support!');
console.log('Available proxies:', PROXY_LIST.length);
console.log('Bot is polling for messages...');

// Test the scraping function on startup (optional)
if (process.argv.includes('--test')) {
  console.log('Testing scraping functionality...');
  fetchMarktplaatsListings('test')
    .then(listings => {
      console.log('Test successful! Found', listings.length, 'listings');
    })
    .catch(error => {
      console.error('Test failed:', error.message);
    });
}

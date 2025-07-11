import axios from 'axios';
import * as cheerio from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dotenv from 'dotenv';
import SearchHistory from './searchHistory.js';

dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// IP Rotation configuration (test proxies)
const PROXY_LIST = [
  'direct', // No proxy
  // Add real proxies here when available
];

class ProxyRotator {
  constructor(proxies) {
    this.proxies = proxies;
    this.currentIndex = 0;
    this.failedProxies = new Set();
  }

  getNextProxy() {
    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  createAxiosInstance(proxy) {
    const config = {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
      config.proxy = false;
    }

    return axios.create(config);
  }
}

// Function to translate text using Groq API
async function translateWithGroq(text, targetLang = 'English') {
  if (!GROQ_API_KEY) {
    console.log('⚠️  No Groq API key found, skipping translation');
    return `[Translation skipped: ${text}]`;
  }

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
    return `[Translation failed: ${text}]`;
  }
}

// Function to test scraping
async function testScraping() {
  console.log('🔍 Testing Marktplaats scraping with IP rotation...');
  
  const proxyRotator = new ProxyRotator(PROXY_LIST);
  const searchHistory = new SearchHistory();
  const proxy = proxyRotator.getNextProxy();
  const axiosInstance = proxyRotator.createAxiosInstance(proxy);
  
  try {
    console.log(`Using proxy: ${proxy}`);
    
    // Test with a simple search - try multiple URL formats (updated 2024)
    const searchQuery = 'gratis';
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
          console.log(`Response status: ${response.status}`);
          console.log(`Response size: ${response.data.length} characters`);
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
    
    // Try multiple selectors for the new 2024 structure
    const selectors = [
      'h3.hz-Listing-title',
      '.hz-Listing-title',
      'a.hz-Listing-coverLink',
      '.hz-Listing-item-wrapper h3',
      '.hz-Listing-group h3'
    ];
    
    // Extract listings from the new structure
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
          source: 'marktplaats',
          selector: 'hz-Listing-item-wrapper'
        });
      }
    });
    
    if (listings.length > 0) {
      console.log(`✅ Found ${listings.length} listings using the new structure!`);
    }
    
    if (listings.length === 0) {
      console.log('⚠️  No listings found with any selector');
      // Debug: save HTML to file for inspection
      console.log('📄 Saving HTML response for debugging...');
      const fs = await import('fs');
      await fs.promises.writeFile('debug-response.html', response.data);
      console.log('HTML saved to debug-response.html');
    } else {
      console.log(`🎉 Successfully found ${listings.length} listings!`);
      
      // Save search to history
      console.log('💾 Saving search to history...');
      const searchMetadata = {
        proxy: proxy,
        responseSize: response.data.length,
        workingUrl: workingUrl,
        testMode: true
      };
      
      await searchHistory.saveSearch(searchQuery, listings, searchMetadata);
      
      // Test translation on first listing
      if (listings.length > 0 && GROQ_API_KEY) {
        console.log('🌐 Testing translation...');
        const firstListing = listings[0];
        const translation = await translateWithGroq(firstListing.title);
        
        console.log('\n📋 Sample result:');
        console.log('Original:', firstListing.title);
        console.log('Translated:', translation);
        console.log('URL:', firstListing.url);
        console.log('Description:', firstListing.description);
      }
      
      // Test search history features
      console.log('\n📊 Testing search history features...');
      const stats = await searchHistory.getStats();
      console.log('Search stats:', {
        totalSearches: stats.totalSearches,
        totalListings: stats.totalListings,
        averageResults: stats.averageResultsPerSearch
      });
      
      const recentSearches = await searchHistory.getRecentSearches(3);
      console.log('Recent searches:', recentSearches.map(s => ({ 
        query: s.query, 
        results: s.totalResults, 
        timestamp: s.timestamp 
      })));
    }
    
    return listings;
    
  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
    throw error;
  }
}

// Test Groq API connection
async function testGroqAPI() {
  console.log('🤖 Testing Groq API connection...');
  
  if (!GROQ_API_KEY) {
    console.log('⚠️  No Groq API key found in environment variables');
    return false;
  }
  
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: 'Hello, please respond with "API test successful"'
          }
        ],
        temperature: 0.3,
        max_tokens: 50,
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Groq API test successful!');
    console.log('Response:', response.data.choices[0].message.content);
    return true;
  } catch (error) {
    console.error('❌ Groq API test failed:', error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting ReHome Marktplaats Bot Tests\n');
  
  // Test 1: Groq API
  await testGroqAPI();
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Web scraping
  try {
    await testScraping();
  } catch (error) {
    console.error('Test failed:', error.message);
  }
  
  console.log('\n🏁 Tests completed!');
}

// Run tests
runTests().catch(console.error); 
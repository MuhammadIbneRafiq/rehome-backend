import fs from 'fs/promises';
import path from 'path';

const SEARCH_HISTORY_FILE = 'search_history.json';

class SearchHistory {
  constructor() {
    this.historyFile = path.join(process.cwd(), SEARCH_HISTORY_FILE);
  }

  // Save a search result to history
  async saveSearch(searchQuery, listings, metadata = {}) {
    try {
      const searchEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        query: searchQuery,
        totalResults: listings.length,
        results: listings,
        metadata: {
          source: 'marktplaats',
          proxy_used: metadata.proxy || 'direct',
          response_size: metadata.responseSize || 0,
          working_url: metadata.workingUrl || '',
          ...metadata
        }
      };

      // Read existing history
      const history = await this.getHistory();
      
      // Add new search to the beginning
      history.unshift(searchEntry);
      
      // Keep only last 1000 searches to prevent file from getting too large
      if (history.length > 1000) {
        history.splice(1000);
      }

      // Save back to file
      await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
      
      console.log(`💾 Saved search "${searchQuery}" with ${listings.length} results to history`);
      return searchEntry.id;
      
    } catch (error) {
      console.error('Error saving search history:', error.message);
      return null;
    }
  }

  // Get all search history
  async getHistory() {
    try {
      const data = await fs.readFile(this.historyFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // If file doesn't exist or is corrupted, return empty array
      if (error.code === 'ENOENT') {
        return [];
      }
      console.error('Error reading search history:', error.message);
      return [];
    }
  }

  // Get recent searches (last N searches)
  async getRecentSearches(limit = 10) {
    const history = await this.getHistory();
    return history.slice(0, limit);
  }

  // Search within saved history
  async searchHistory(query) {
    const history = await this.getHistory();
    const lowercaseQuery = query.toLowerCase();
    
    return history.filter(entry => 
      entry.query.toLowerCase().includes(lowercaseQuery) ||
      entry.results.some(listing => 
        listing.title.toLowerCase().includes(lowercaseQuery) ||
        (listing.description && listing.description.toLowerCase().includes(lowercaseQuery))
      )
    );
  }

  // Get statistics about search history
  async getStats() {
    const history = await this.getHistory();
    
    if (history.length === 0) {
      return {
        totalSearches: 0,
        totalListings: 0,
        mostPopularQueries: [],
        averageResultsPerSearch: 0
      };
    }

    const totalListings = history.reduce((sum, entry) => sum + entry.totalResults, 0);
    const queryFrequency = {};
    
    history.forEach(entry => {
      const query = entry.query.toLowerCase();
      queryFrequency[query] = (queryFrequency[query] || 0) + 1;
    });
    
    const mostPopularQueries = Object.entries(queryFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([query, count]) => ({ query, count }));

    return {
      totalSearches: history.length,
      totalListings,
      mostPopularQueries,
      averageResultsPerSearch: Math.round(totalListings / history.length),
      oldestSearch: history[history.length - 1]?.timestamp,
      newestSearch: history[0]?.timestamp
    };
  }

  // Get all unique listings (deduplicated by URL)
  async getAllUniqueListings() {
    const history = await this.getHistory();
    const uniqueListings = new Map();
    
    history.forEach(entry => {
      entry.results.forEach(listing => {
        if (!uniqueListings.has(listing.url)) {
          uniqueListings.set(listing.url, {
            ...listing,
            firstSeen: entry.timestamp,
            searchQuery: entry.query
          });
        }
      });
    });
    
    return Array.from(uniqueListings.values());
  }

  // Clean old entries (older than specified days)
  async cleanOldEntries(daysToKeep = 30) {
    const history = await this.getHistory();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const filteredHistory = history.filter(entry => 
      new Date(entry.timestamp) > cutoffDate
    );
    
    if (filteredHistory.length !== history.length) {
      await fs.writeFile(this.historyFile, JSON.stringify(filteredHistory, null, 2));
      console.log(`🧹 Cleaned ${history.length - filteredHistory.length} old search entries`);
    }
    
    return filteredHistory.length;
  }
}

export default SearchHistory; 
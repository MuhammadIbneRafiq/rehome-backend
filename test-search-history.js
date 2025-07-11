import SearchHistory from './searchHistory.js';

// Test search history functionality
async function testSearchHistory() {
  console.log('🧪 Testing SearchHistory functionality...\n');
  
  const searchHistory = new SearchHistory();
  
  // Test 1: Save some sample searches
  console.log('1. Testing search saving...');
  
  const sampleListings1 = [
    { title: 'Gratis bank te halen', url: 'https://example.com/1', description: 'Mooie bank' },
    { title: 'Gratis tafel', url: 'https://example.com/2', description: 'Houten tafel' },
    { title: 'Gratis stoel', url: 'https://example.com/3', description: 'Comfortabele stoel' }
  ];
  
  const sampleListings2 = [
    { title: 'Gratis boeken', url: 'https://example.com/4', description: 'Diverse boeken' },
    { title: 'Gratis kleding', url: 'https://example.com/5', description: 'Winterkleding' }
  ];
  
  await searchHistory.saveSearch('gratis meubels', sampleListings1, { proxy: 'direct', testMode: true });
  await searchHistory.saveSearch('gratis spullen', sampleListings2, { proxy: 'direct', testMode: true });
  console.log('✅ Sample searches saved\n');
  
  // Test 2: Get search statistics
  console.log('2. Testing search statistics...');
  const stats = await searchHistory.getStats();
  console.log('📊 Stats:', {
    totalSearches: stats.totalSearches,
    totalListings: stats.totalListings,
    averageResults: stats.averageResultsPerSearch,
    mostPopular: stats.mostPopularQueries
  });
  console.log('✅ Statistics retrieved\n');
  
  // Test 3: Get recent searches
  console.log('3. Testing recent searches...');
  const recentSearches = await searchHistory.getRecentSearches(5);
  console.log('📋 Recent searches:');
  recentSearches.forEach((search, index) => {
    console.log(`   ${index + 1}. "${search.query}" - ${search.totalResults} results`);
  });
  console.log('✅ Recent searches retrieved\n');
  
  // Test 4: Search within history
  console.log('4. Testing search within history...');
  const filteredSearches = await searchHistory.searchHistory('meubels');
  console.log('🔍 Searches containing "meubels":');
  filteredSearches.forEach(search => {
    console.log(`   - "${search.query}" (${search.totalResults} results)`);
  });
  console.log('✅ History search completed\n');
  
  // Test 5: Get all unique listings
  console.log('5. Testing unique listings...');
  const uniqueListings = await searchHistory.getAllUniqueListings();
  console.log('📦 All unique listings:');
  uniqueListings.forEach((listing, index) => {
    console.log(`   ${index + 1}. "${listing.title}" from search "${listing.searchQuery}"`);
  });
  console.log('✅ Unique listings retrieved\n');
  
  // Test 6: Test with real scraping (if available)
  console.log('6. Testing with real scraping...');
  try {
    // Import the scraping functionality
    const { ProxyRotator, testScraping } = await import('./test-bot.js');
    
    // Do a quick real search
    console.log('Running real search test...');
    await testScraping();
    
    // Check updated stats
    const updatedStats = await searchHistory.getStats();
    console.log('📊 Updated stats after real search:', {
      totalSearches: updatedStats.totalSearches,
      totalListings: updatedStats.totalListings,
      averageResults: updatedStats.averageResultsPerSearch
    });
    console.log('✅ Real search test completed\n');
    
  } catch (error) {
    console.log('⚠️  Real search test skipped:', error.message);
  }
  
  console.log('🎉 All SearchHistory tests completed!');
}

// Run the test
testSearchHistory().catch(console.error); 
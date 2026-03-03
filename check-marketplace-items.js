// Check marketplace furniture items status
import { supabaseClient } from './db/params.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkMarketplaceItems() {
  try {
    console.log('🔍 Checking marketplace furniture items...');
    
    // Get all items with their sold status
    const { data: allItems, error: allError } = await supabaseClient
      .from('marketplace_furniture')
      .select('id, name, sold, created_at')
      .order('created_at', { ascending: false });
    
    if (allError) {
      console.error('Error fetching all items:', allError);
      return;
    }
    
    console.log(`📊 Total items in database: ${allItems.length}`);
    
    // Count by status
    const soldCount = allItems.filter(item => item.sold === true).length;
    const availableCount = allItems.filter(item => item.sold === false).length;
    
    console.log(`✅ Available (not sold): ${availableCount}`);
    console.log(`❌ Sold: ${soldCount}`);
    
    // Show sold items details
    if (soldCount > 0) {
      console.log('\n🔴 Sold items:');
      allItems
        .filter(item => item.sold === true)
        .forEach(item => {
          console.log(`  - ${item.name} (ID: ${item.id})`);
          console.log('');
        });
    }
    
    // Show available items
    if (availableCount > 0) {
      console.log('\n🟢 Available items:');
      allItems
        .filter(item => item.sold === false)
        .forEach(item => {
          console.log(`  - ${item.name} (ID: ${item.id})`);
        });
    }
    
  } catch (error) {
    console.error('❌ Error checking marketplace items:', error);
  }
}

checkMarketplaceItems();

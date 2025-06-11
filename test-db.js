import { supabaseClient } from './db/params.js';

async function testDatabase() {
    console.log('Testing Supabase connection...');
    
    try {
        // Test basic connection
        const { data, error } = await supabaseClient
            .from('furniture')
            .select('id, name, price')
            .limit(5);
        
        if (error) {
            console.error('Supabase Error:', error);
            return;
        }
        
        console.log('✅ Database connection successful!');
        console.log('Sample data:', data);
        
    } catch (err) {
        console.error('❌ Connection failed:', err);
    }
}

testDatabase(); 
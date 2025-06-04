import { supabaseClient } from './params.js';
import bcrypt from 'bcryptjs';

const initializeDatabase = async () => {
    console.log('Starting database initialization...');
    
    try {
        // We'll insert data directly using Supabase client since we can't execute raw SQL easily
        console.log('Creating initial pricing configuration...');
        
        const pricingConfig = {
            config: {
                baseMultiplier: 1.0,
                weekendMultiplier: 1.2,
                cityDayMultiplier: 1.3,
                floorChargePerLevel: 25.0,
                elevatorDiscount: 0.8,
                assemblyChargePerItem: 30.0,
                extraHelperChargePerItem: 20.0,
                studentDiscount: 0.15,
                earlyBookingDiscount: 0.1,
                minimumCharge: 75.0
            },
            is_active: true
        };

        // Insert pricing config
        const { error: configError } = await supabaseClient
            .from('pricing_config')
            .insert(pricingConfig);
        
        if (configError) {
            console.log('Pricing config might already exist:', configError.message);
        } else {
            console.log('✓ Pricing configuration created');
        }

        // Insert furniture items
        console.log('Creating furniture items...');
        const furnitureItems = [
            { name: 'Single Bed', category: 'Bedroom', points: 3.5 },
            { name: 'Double Bed', category: 'Bedroom', points: 5.0 },
            { name: 'Queen Bed', category: 'Bedroom', points: 6.0 },
            { name: 'King Bed', category: 'Bedroom', points: 7.0 },
            { name: 'Mattress (Single)', category: 'Bedroom', points: 2.0 },
            { name: 'Mattress (Double)', category: 'Bedroom', points: 3.0 },
            { name: 'Mattress (Queen)', category: 'Bedroom', points: 3.5 },
            { name: 'Mattress (King)', category: 'Bedroom', points: 4.0 },
            { name: 'Wardrobe (Small)', category: 'Bedroom', points: 4.0 },
            { name: 'Wardrobe (Large)', category: 'Bedroom', points: 6.0 },
            { name: 'Chest of Drawers', category: 'Bedroom', points: 3.0 },
            { name: 'Bedside Table', category: 'Bedroom', points: 1.5 },
            { name: 'Dining Table (Small)', category: 'Dining', points: 3.0 },
            { name: 'Dining Table (Large)', category: 'Dining', points: 5.0 },
            { name: 'Dining Chair', category: 'Dining', points: 1.0 },
            { name: 'Bar Stool', category: 'Dining', points: 1.0 },
            { name: 'Sofa (2-seater)', category: 'Living Room', points: 4.0 },
            { name: 'Sofa (3-seater)', category: 'Living Room', points: 5.5 },
            { name: 'Armchair', category: 'Living Room', points: 2.5 },
            { name: 'Coffee Table', category: 'Living Room', points: 2.0 },
            { name: 'TV Stand', category: 'Living Room', points: 2.5 },
            { name: 'Bookshelf', category: 'Living Room', points: 3.0 },
            { name: 'Refrigerator', category: 'Kitchen', points: 5.0 },
            { name: 'Washing Machine', category: 'Kitchen', points: 4.5 },
            { name: 'Dishwasher', category: 'Kitchen', points: 3.5 },
            { name: 'Microwave', category: 'Kitchen', points: 1.5 },
            { name: 'Desk', category: 'Office', points: 3.0 },
            { name: 'Office Chair', category: 'Office', points: 2.0 },
            { name: 'Filing Cabinet', category: 'Office', points: 2.5 }
        ];

        const { error: furnitureError } = await supabaseClient
            .from('furniture_items')
            .insert(furnitureItems);
        
        if (furnitureError) {
            console.log('Furniture items might already exist:', furnitureError.message);
        } else {
            console.log('✓ Furniture items created');
        }

        // Insert city base charges
        console.log('Creating city base charges...');
        const cityCharges = [
            { city_name: 'Amsterdam', normal: 120.00, city_day: 150.00 },
            { city_name: 'Rotterdam', normal: 110.00, city_day: 140.00 },
            { city_name: 'The Hague', normal: 115.00, city_day: 145.00 },
            { city_name: 'Utrecht', normal: 110.00, city_day: 140.00 },
            { city_name: 'Eindhoven', normal: 100.00, city_day: 130.00 },
            { city_name: 'Tilburg', normal: 95.00, city_day: 125.00 },
            { city_name: 'Groningen', normal: 100.00, city_day: 130.00 },
            { city_name: 'Almere', normal: 105.00, city_day: 135.00 },
            { city_name: 'Breda', normal: 100.00, city_day: 130.00 },
            { city_name: 'Nijmegen', normal: 105.00, city_day: 135.00 }
        ];

        const { error: cityChargesError } = await supabaseClient
            .from('city_base_charges')
            .insert(cityCharges);
        
        if (cityChargesError) {
            console.log('City charges might already exist:', cityChargesError.message);
        } else {
            console.log('✓ City base charges created');
        }

        // Insert city day data
        console.log('Creating city day data...');
        const cityDays = [
            { city_name: 'Amsterdam', days: ['Saturday', 'Sunday'] },
            { city_name: 'Rotterdam', days: ['Friday', 'Saturday'] },
            { city_name: 'The Hague', days: ['Saturday', 'Sunday'] },
            { city_name: 'Utrecht', days: ['Thursday', 'Friday', 'Saturday'] },
            { city_name: 'Eindhoven', days: ['Saturday'] },
            { city_name: 'Tilburg', days: ['Friday', 'Saturday'] },
            { city_name: 'Groningen', days: ['Saturday', 'Sunday'] },
            { city_name: 'Almere', days: ['Saturday'] },
            { city_name: 'Breda', days: ['Friday', 'Saturday'] },
            { city_name: 'Nijmegen', days: ['Saturday', 'Sunday'] }
        ];

        const { error: cityDaysError } = await supabaseClient
            .from('city_day_data')
            .insert(cityDays);
        
        if (cityDaysError) {
            console.log('City day data might already exist:', cityDaysError.message);
        } else {
            console.log('✓ City day data created');
        }

        // Create initial admin user
        console.log('Creating admin user...');
        const passwordHash = await bcrypt.hash('admin123', 10);
        
        const adminUser = {
            email: 'admin@rehome.com',
            password_hash: passwordHash,
            role: 'admin',
            is_active: true
        };

        const { error: adminError } = await supabaseClient
            .from('admin_users')
            .insert(adminUser);
        
        if (adminError) {
            console.log('Admin user might already exist:', adminError.message);
        } else {
            console.log('✓ Admin user created');
        }

        console.log('Database initialization completed successfully!');
        console.log('Admin credentials: admin@rehome.com / admin123');
        
    } catch (error) {
        console.error('Error during database initialization:', error);
    }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    initializeDatabase();
}

export { initializeDatabase }; 
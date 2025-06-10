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
            { city_name: 'Amsterdam', normal: 119.00, city_day: 39.00, day_of_week: 1 },
            { city_name: 'Utrecht', normal: 119.00, city_day: 35.00, day_of_week: 1 },
            { city_name: 'Almere', normal: 129.00, city_day: 44.00, day_of_week: 1 },
            { city_name: 'Haarlem', normal: 119.00, city_day: 44.00, day_of_week: 1 },
            { city_name: 'Zaanstad', normal: 119.00, city_day: 39.00, day_of_week: 1 },
            { city_name: 'Amersfoort', normal: 129.00, city_day: 49.00, day_of_week: 1 },
            { city_name: 's-Hertogenbosch', normal: 89.00, city_day: 39.00, day_of_week: 1 },
            { city_name: 'Hoofddorp', normal: 119.00, city_day: 39.00, day_of_week: 1 },
            { city_name: 'Rotterdam', normal: 119.00, city_day: 35.00, day_of_week: 2 },
            { city_name: 'The Hague', normal: 119.00, city_day: 35.00, day_of_week: 2 },
            { city_name: 'Breda', normal: 79.00, city_day: 35.00, day_of_week: 2 },
            { city_name: 'Leiden', normal: 129.00, city_day: 39.00, day_of_week: 2 },
            { city_name: 'Dordrecht', normal: 109.00, city_day: 35.00, day_of_week: 2 },
            { city_name: 'Zoetermeer', normal: 119.00, city_day: 35.00, day_of_week: 2 },
            { city_name: 'Delft', normal: 119.00, city_day: 35.00, day_of_week: 2 },
            { city_name: 'Eindhoven', normal: 89.00, city_day: 34.00, day_of_week: 3 },
            { city_name: 'Maastricht', normal: 149.00, city_day: 34.00, day_of_week: 3 },
            { city_name: 'Tilburg', normal: 29.00, city_day: 29.00, day_of_week: 4 },
            { city_name: 'Groningen', normal: 219.00, city_day: 69.00, day_of_week: 5 },
            { city_name: 'Nijmegen', normal: 149.00, city_day: 59.00, day_of_week: 6 },
            { city_name: 'Enschede', normal: 159.00, city_day: 69.00, day_of_week: 6 },
            { city_name: 'Arnhem', normal: 159.00, city_day: 59.00, day_of_week: 6 },
            { city_name: 'Apeldoorn', normal: 159.00, city_day: 49.00, day_of_week: 6 },
            { city_name: 'Deventer', normal: 159.00, city_day: 99.00, day_of_week: 6 },
            { city_name: 'Zwolle', normal: 179.00, city_day: 119.00, day_of_week: 7 }
        ];

        const { error: cityChargesError } = await supabaseClient
            .from('city_base_charges')
            .insert(cityCharges);
        
        if (cityChargesError) {
            console.log('City charges might already exist:', cityChargesError.message);
        } else {
            console.log('✓ City base charges created');
        }

        // Insert city day data (using day numbers: 1=Monday, 2=Tuesday, ..., 7=Sunday)
        console.log('Creating city day data...');
        const cityDays = [
            { city_name: 'Amsterdam', days: [1] },
            { city_name: 'Utrecht', days: [1] },
            { city_name: 'Almere', days: [1] },
            { city_name: 'Haarlem', days: [1] },
            { city_name: 'Zaanstad', days: [1] },
            { city_name: 'Amersfoort', days: [1] },
            { city_name: 's-Hertogenbosch', days: [1] },
            { city_name: 'Hoofddorp', days: [1] },
            { city_name: 'Rotterdam', days: [2] },
            { city_name: 'The Hague', days: [2] },
            { city_name: 'Breda', days: [2] },
            { city_name: 'Leiden', days: [2] },
            { city_name: 'Dordrecht', days: [2] },
            { city_name: 'Zoetermeer', days: [2] },
            { city_name: 'Delft', days: [2] },
            { city_name: 'Eindhoven', days: [3] },
            { city_name: 'Maastricht', days: [3] },
            { city_name: 'Tilburg', days: [4] },
            { city_name: 'Groningen', days: [5] },
            { city_name: 'Nijmegen', days: [6] },
            { city_name: 'Enschede', days: [6] },
            { city_name: 'Arnhem', days: [6] },
            { city_name: 'Apeldoorn', days: [6] },
            { city_name: 'Deventer', days: [6] },
            { city_name: 'Zwolle', days: [7] }
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
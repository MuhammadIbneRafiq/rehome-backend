-- Update furniture items with exact points from the document

-- Clear existing furniture items and insert correct ones
DELETE FROM furniture_items;

-- Insert furniture items with exact points from the document
INSERT INTO furniture_items (name, category, points) VALUES

-- Sofa's and Chairs (Banken en Stoelen)
('2-Seater Sofa', 'Sofa''s and Chairs', 10.0),
('3-Seater Sofa', 'Sofa''s and Chairs', 12.0),
('Armchair', 'Sofa''s and Chairs', 4.0),
('Office Chair', 'Sofa''s and Chairs', 3.0),
('Chair', 'Sofa''s and Chairs', 2.0),

-- Bed (Bed)
('1-Person Bed', 'Bed', 4.0),
('2-Person Bed', 'Bed', 8.0),
('1-Person Mattress', 'Bed', 3.0),
('2-Person Mattress', 'Bed', 6.0),
('Bedside Table', 'Bed', 2.0),

-- Storage (Kasten & Opbergen)
('2-Doors Closet', 'Storage', 8.0),
('3-Doors Closet', 'Storage', 10.0),
('Cloth Rack', 'Storage', 3.0),
('Bookcase', 'Storage', 6.0),
('Drawer/Dressoir', 'Storage', 5.0),
('TV Table', 'Storage', 4.0),

-- Tables (Tafels)
('Office Table', 'Tables', 5.0),
('Dining Table', 'Tables', 6.0),
('Side Table', 'Tables', 2.0),
('Coffee Table', 'Tables', 3.0),

-- Appliances (Apparaten)
('Washing Machine', 'Appliances', 12.0),
('Dryer', 'Appliances', 8.0),
('Big Fridge/Freezer', 'Appliances', 8.0),
('Small Fridge/Freezer', 'Appliances', 4.0),

-- Others (Overige Items)
('Box', 'Others', 0.3),
('Luggage', 'Others', 0.5),
('Bike', 'Others', 6.0),
('Mirror', 'Others', 2.0),
('TV', 'Others', 2.0),
('Computer', 'Others', 2.0),
('Standing Lamp', 'Others', 2.0),
('Small Appliance', 'Others', 1.0),
('Small Household Items', 'Others', 1.0),
('Small Furniture', 'Others', 3.0),
('Big Furniture', 'Others', 8.0); 
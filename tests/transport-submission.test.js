import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../server.js';
import { supabaseClient } from '../db/params.js';

describe('Transportation Request Submission Tests', () => {
  let testRequestId;

  afterAll(async () => {
    // Clean up test data
    if (testRequestId) {
      await supabaseClient
        .from('transportation_requests')
        .delete()
        .eq('id', testRequestId);
    }
  });

  describe('Backend API Tests', () => {
    it('should create a transportation request with all required fields', async () => {
      const formData = new FormData();
      
      // Add all required fields
      formData.append('customerName', 'John Doe');
      formData.append('email', 'john.doe@test.com');
      formData.append('phone', '+31612345678');
      formData.append('serviceType', 'item-transport');
      formData.append('pickupLocation', JSON.stringify({
        city: 'Amsterdam',
        displayName: 'Amsterdam, Netherlands',
        coordinates: { lat: 52.3676, lng: 4.9041 }
      }));
      formData.append('dropoffLocation', JSON.stringify({
        city: 'Rotterdam',
        displayName: 'Rotterdam, Netherlands',
        coordinates: { lat: 51.9225, lng: 4.4792 }
      }));
      formData.append('selectedDate', '2024-03-01');
      formData.append('pickupDate', '2024-03-01');
      formData.append('dropoffDate', '2024-03-01');
      formData.append('isDateFlexible', 'false');
      formData.append('items', JSON.stringify([
        { id: 'bed', name: 'Single Bed', quantity: 1, points: 10 }
      ]));
      formData.append('hasStudentId', 'false');
      formData.append('needsAssembly', 'false');
      formData.append('needsExtraHelper', 'false');
      formData.append('pickupFloors', '0');
      formData.append('dropoffFloors', '0');
      formData.append('hasElevatorPickup', 'false');
      formData.append('hasElevatorDropoff', 'false');
      formData.append('specialInstructions', '');
      formData.append('isBusiness', 'false');
      formData.append('businessType', '');

      const response = await request(app)
        .post('/api/transport/create')
        .send(formData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('requestId');
      expect(response.body.data).toHaveProperty('pricing');
      
      testRequestId = response.body.data.requestId;
    });

    it('should handle business transport requests', async () => {
      const formData = new FormData();
      
      // Add business-specific fields
      formData.append('customerName', 'Business User');
      formData.append('email', 'business@test.com');
      formData.append('phone', '+31612345678');
      formData.append('serviceType', 'item-transport');
      formData.append('pickupLocation', JSON.stringify({
        city: 'Amsterdam',
        displayName: 'Amsterdam Business District',
        coordinates: { lat: 52.3676, lng: 4.9041 }
      }));
      formData.append('dropoffLocation', JSON.stringify({
        city: 'Amsterdam',
        displayName: 'Amsterdam Warehouse',
        coordinates: { lat: 52.3700, lng: 4.9100 }
      }));
      formData.append('selectedDate', '2024-03-05');
      formData.append('isDateFlexible', 'false');
      formData.append('items', JSON.stringify([
        { id: 'pallet', name: 'EURO Pallet', quantity: 2, points: 50 }
      ]));
      formData.append('isBusiness', 'true');
      formData.append('businessType', 'euro-pallet');
      formData.append('pickupFloors', '0');
      formData.append('dropoffFloors', '0');
      formData.append('hasElevatorPickup', 'false');
      formData.append('hasElevatorDropoff', 'false');

      const response = await request(app)
        .post('/api/transport/create')
        .send(formData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should validate required fields', async () => {
      const formData = new FormData();
      
      // Missing required fields
      formData.append('customerName', 'Test User');
      // Missing email, phone, locations, etc.

      const response = await request(app)
        .post('/api/transport/create')
        .send(formData);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('should calculate correct pricing for boxes with carrying', async () => {
      const formData = new FormData();
      
      formData.append('customerName', 'Box Mover');
      formData.append('email', 'boxes@test.com');
      formData.append('phone', '+31612345678');
      formData.append('serviceType', 'item-transport');
      formData.append('pickupLocation', JSON.stringify({
        city: 'Amsterdam',
        coordinates: { lat: 52.3676, lng: 4.9041 }
      }));
      formData.append('dropoffLocation', JSON.stringify({
        city: 'Amsterdam',
        coordinates: { lat: 52.3700, lng: 4.9100 }
      }));
      formData.append('selectedDate', '2024-03-01');
      formData.append('items', JSON.stringify([
        { id: 'moving-box', name: 'Moving Box', quantity: 5, points: 2 }
      ]));
      formData.append('pickupFloors', '3'); // 3rd floor
      formData.append('dropoffFloors', '2'); // 2nd floor
      formData.append('hasElevatorPickup', 'false');
      formData.append('hasElevatorDropoff', 'false');

      const response = await request(app)
        .post('/api/transport/create')
        .send(formData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      const pricing = response.body.data.pricing;
      // Boxes should use 0.5 multiplier for carrying
      // 5 boxes * 2 points * 5 floors * 0.5 multiplier = 25 + base fee
      expect(pricing.carryingCost).toBeGreaterThan(0);
      expect(pricing.breakdown.carrying.itemBreakdown[0].multiplier).toBe(0.5);
    });
  });

  describe('Database Integrity Tests', () => {
    it('should save all fields correctly to database', async () => {
      const formData = new FormData();
      
      // Create a request with all fields
      formData.append('customerName', 'Database Test');
      formData.append('email', 'db@test.com');
      formData.append('phone', '+31612345678');
      formData.append('serviceType', 'house-moving');
      formData.append('pickupLocation', JSON.stringify({
        city: 'Utrecht',
        displayName: 'Utrecht Central',
        coordinates: { lat: 52.0907, lng: 5.1214 }
      }));
      formData.append('dropoffLocation', JSON.stringify({
        city: 'Eindhoven',
        displayName: 'Eindhoven Station',
        coordinates: { lat: 51.4416, lng: 5.4697 }
      }));
      formData.append('selectedDate', '2024-03-10');
      formData.append('isDateFlexible', 'true');
      formData.append('items', JSON.stringify([
        { id: 'sofa', name: '3-Seater Sofa', quantity: 1, points: 20 },
        { id: 'table', name: 'Dining Table', quantity: 1, points: 15 }
      ]));
      formData.append('hasStudentId', 'true');
      formData.append('needsAssembly', 'true');
      formData.append('needsExtraHelper', 'true');
      formData.append('pickupFloors', '4');
      formData.append('dropoffFloors', '2');
      formData.append('hasElevatorPickup', 'true');
      formData.append('hasElevatorDropoff', 'false');
      formData.append('specialInstructions', 'Handle with care');

      const response = await request(app)
        .post('/api/transport/create')
        .send(formData);

      expect(response.status).toBe(200);
      const requestId = response.body.data.requestId;

      // Verify data was saved correctly
      const { data: savedRequest } = await supabaseClient
        .from('transportation_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      expect(savedRequest).toBeTruthy();
      expect(savedRequest.customer_name).toBe('Database Test');
      expect(savedRequest.customer_email).toBe('db@test.com');
      expect(savedRequest.phone).toBe('+31612345678');
      expect(savedRequest.service_type).toBe('house-moving');
      expect(savedRequest.pickup_location.city).toBe('Utrecht');
      expect(savedRequest.dropoff_location.city).toBe('Eindhoven');
      expect(savedRequest.is_date_flexible).toBe(true);
      expect(savedRequest.has_student_id).toBe(true);
      expect(savedRequest.needs_assembly).toBe(true);
      expect(savedRequest.needs_extra_helper).toBe(true);
      expect(savedRequest.pickup_floors).toBe(4);
      expect(savedRequest.dropoff_floors).toBe(2);
      expect(savedRequest.has_elevator_pickup).toBe(true);
      expect(savedRequest.has_elevator_dropoff).toBe(false);
      expect(savedRequest.special_instructions).toBe('Handle with care');
      expect(savedRequest.items).toHaveLength(2);
      expect(savedRequest.pricing_breakdown).toHaveProperty('total');
      expect(savedRequest.order_number).toBeTruthy();
      expect(savedRequest.status).toBe('pending');

      // Clean up
      await supabaseClient
        .from('transportation_requests')
        .delete()
        .eq('id', requestId);
    });

    it('should handle date format correctly', async () => {
      const testDates = [
        { pickup: '2024-03-15', dropoff: '2024-03-16' },
        { pickup: '2024-03-20T10:00:00Z', dropoff: '2024-03-20T14:00:00Z' }
      ];

      for (const dates of testDates) {
        const formData = new FormData();
        formData.append('customerName', 'Date Test');
        formData.append('email', 'date@test.com');
        formData.append('phone', '+31612345678');
        formData.append('serviceType', 'item-transport');
        formData.append('pickupLocation', JSON.stringify({
          city: 'Amsterdam',
          coordinates: { lat: 52.3676, lng: 4.9041 }
        }));
        formData.append('dropoffLocation', JSON.stringify({
          city: 'Amsterdam',
          coordinates: { lat: 52.3700, lng: 4.9100 }
        }));
        formData.append('pickupDate', dates.pickup);
        formData.append('dropoffDate', dates.dropoff);
        formData.append('selectedDate', dates.pickup);
        formData.append('items', JSON.stringify([
          { id: 'box', name: 'Box', quantity: 1, points: 2 }
        ]));

        const response = await request(app)
          .post('/api/transport/create')
          .send(formData);

        expect(response.status).toBe(200);

        const { data: savedRequest } = await supabaseClient
          .from('transportation_requests')
          .select('pickup_date, dropoff_date')
          .eq('id', response.body.data.requestId)
          .single();

        expect(savedRequest.pickup_date).toBeTruthy();
        expect(savedRequest.dropoff_date).toBeTruthy();

        // Clean up
        await supabaseClient
          .from('transportation_requests')
          .delete()
          .eq('id', response.body.data.requestId);
      }
    });
  });
});

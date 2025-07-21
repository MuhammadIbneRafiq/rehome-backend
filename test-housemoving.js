// If using Node.js 18+, fetch is built-in. Otherwise, uncomment the next line:
// import fetch from 'node-fetch';

async function testHouseMovingRequest() {
  const payload = {
    pickupType: "apartment",
    furnitureItems: ["Sofa", "Table", "Chair"],
    customItem: "Large Mirror",
    floorPickup: 2,
    floorDropoff: 3,
    contactInfo: {
      email: "muhammadibnerafiq@gmail.com",
      firstName: "Test",
      lastName: "User",
      phone: "+31612345678"
    },
    estimatedPrice: 250.00,
    selectedDateRange: {
      start: "2024-07-01T09:00:00.000Z",
      end: "2024-07-01T17:00:00.000Z"
    },
    isDateFlexible: true,
    basePrice: 200.00,
    itemPoints: 15,
    carryingCost: 20.00,
    disassemblyCost: 10.00,
    distanceCost: 15.00,
    extraHelperCost: 5.00,
    distanceKm: 78.5,
    firstLocation: "Amsterdam",
    secondLocation: "Rotterdam",
    firstLocationCoords: "52.3676,4.9041",
    secondLocationCoords: "51.9225,4.4792",
    orderSummary: {
      pickupDetails: {
        address: "Amsterdam",
        floor: 2,
        elevator: false
      },
      deliveryDetails: {
        address: "Rotterdam",
        floor: 3,
        elevator: false
      },
      schedule: {
        date: "2024-07-01",
        time: "Morning (8:00 - 12:00)"
      },
      items: [
        { name: "Sofa", quantity: 1 },
        { name: "Table", quantity: 1 },
        { name: "Chair", quantity: 1 }
      ],
      additionalServices: {
        assembly: 10.00,
        extraHelper: 5.00,
        carrying: 20.00,
        studentDiscount: 0.00
      },
      contactInfo: {
        name: "Test User",
        email: "testuser@example.com",
        phone: "+31612345678"
      },
      totalPrice: 250.00
    }
  };

  try {
    const res = await fetch('http://localhost:3000/api/house-moving-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', data);
  } catch (err) {
    console.error('Error:', err);
  }
}

testHouseMovingRequest(); 
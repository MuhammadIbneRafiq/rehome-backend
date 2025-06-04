# ReHome Pricing System - Backend API Specification

## Overview
This document outlines the backend API structure for the ReHome pricing system. The system uses Node.js with Express and Supabase (PostgreSQL) as the database.

## Database Schema

### 1. Furniture Items Table
```sql
CREATE TABLE furniture_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    points DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_furniture_items_category ON furniture_items(category);
CREATE INDEX idx_furniture_items_name ON furniture_items(name);
```

### 2. City Base Charges Table
```sql
CREATE TABLE city_base_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_name VARCHAR(100) NOT NULL UNIQUE,
    normal DECIMAL(8,2) NOT NULL,
    city_day DECIMAL(8,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster city lookups
CREATE INDEX idx_city_base_charges_name ON city_base_charges(city_name);
```

### 3. City Day Data Table
```sql
CREATE TABLE city_day_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_name VARCHAR(100) NOT NULL UNIQUE,
    days TEXT[] NOT NULL, -- Array of day names
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster city lookups
CREATE INDEX idx_city_day_data_name ON city_day_data(city_name);
```

### 4. Pricing Configuration Table
```sql
CREATE TABLE pricing_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure only one active config at a time
CREATE UNIQUE INDEX idx_pricing_config_active ON pricing_config(is_active) WHERE is_active = TRUE;
```

### 5. Admin Users Table
```sql
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster email lookups
CREATE INDEX idx_admin_users_email ON admin_users(email);
```

### 6. Audit Logs Table
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admin_users(id),
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

## API Endpoints

### Authentication Endpoints

#### POST /api/admin/login
```typescript
// Request
{
  email: string;
  password: string;
}

// Response
{
  success: boolean;
  data?: {
    user: AdminUser;
    token: string;
    expiresAt: string;
  };
  error?: string;
}
```

#### POST /api/admin/logout
```typescript
// Headers: Authorization: Bearer <token>
// Response
{
  success: boolean;
  message: string;
}
```

### Furniture Items Endpoints

#### GET /api/furniture-items
```typescript
// Query Parameters
{
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
}

// Response
{
  success: boolean;
  data: FurnitureItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

#### POST /api/furniture-items
```typescript
// Headers: Authorization: Bearer <admin-token>
// Request
{
  name: string;
  category: string;
  points: number;
}

// Response
{
  success: boolean;
  data?: FurnitureItem;
  error?: string;
}
```

#### PUT /api/furniture-items/:id
```typescript
// Headers: Authorization: Bearer <admin-token>
// Request
{
  name?: string;
  category?: string;
  points?: number;
}

// Response
{
  success: boolean;
  data?: FurnitureItem;
  error?: string;
}
```

#### DELETE /api/furniture-items/:id
```typescript
// Headers: Authorization: Bearer <admin-token>
// Response
{
  success: boolean;
  message: string;
  error?: string;
}
```

### City Base Charges Endpoints

#### GET /api/city-base-charges
```typescript
// Response
{
  success: boolean;
  data: CityBaseCharge[];
}
```

#### POST /api/city-base-charges
```typescript
// Headers: Authorization: Bearer <admin-token>
// Request
{
  cityName: string;
  normal: number;
  cityDay: number;
}

// Response
{
  success: boolean;
  data?: CityBaseCharge;
  error?: string;
}
```

#### PUT /api/city-base-charges/:cityName
```typescript
// Headers: Authorization: Bearer <admin-token>
// Request
{
  normal?: number;
  cityDay?: number;
}

// Response
{
  success: boolean;
  data?: CityBaseCharge;
  error?: string;
}
```

### City Day Data Endpoints

#### GET /api/city-day-data
```typescript
// Response
{
  success: boolean;
  data: CityDayData[];
}
```

#### POST /api/city-day-data
```typescript
// Headers: Authorization: Bearer <admin-token>
// Request
{
  cityName: string;
  days: string[];
}

// Response
{
  success: boolean;
  data?: CityDayData;
  error?: string;
}
```

#### PUT /api/city-day-data/:cityName
```typescript
// Headers: Authorization: Bearer <admin-token>
// Request
{
  days: string[];
}

// Response
{
  success: boolean;
  data?: CityDayData;
  error?: string;
}
```

### Pricing Configuration Endpoints

#### GET /api/pricing-config
```typescript
// Response
{
  success: boolean;
  data?: PricingConfig;
}
```

#### PUT /api/pricing-config
```typescript
// Headers: Authorization: Bearer <admin-token>
// Request
{
  config: Partial<PricingConfig>;
}

// Response
{
  success: boolean;
  data?: PricingConfig;
  error?: string;
}
```

### Pricing Calculation Endpoint

#### POST /api/calculate-pricing
```typescript
// Request
{
  serviceType: 'house-moving' | 'item-transport';
  pickupLocation: string;
  dropoffLocation: string;
  selectedDate: string;
  isDateFlexible: boolean;
  itemQuantities: { [key: string]: number };
  floorPickup: number;
  floorDropoff: number;
  elevatorPickup: boolean;
  elevatorDropoff: boolean;
  assemblyItems: { [key: string]: boolean };
  extraHelperItems: { [key: string]: boolean };
  isStudent: boolean;
  hasStudentId: boolean;
  isEarlyBooking?: boolean;
}

// Response
{
  success: boolean;
  data?: PricingBreakdown;
  error?: string;
}
```

### Audit Logs Endpoints

#### GET /api/audit-logs
```typescript
// Headers: Authorization: Bearer <admin-token>
// Query Parameters
{
  page?: number;
  limit?: number;
  adminId?: string;
  tableName?: string;
  startDate?: string;
  endDate?: string;
}

// Response
{
  success: boolean;
  data: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

## Implementation Notes

### 1. Environment Variables
```env
DATABASE_URL=postgresql://username:password@localhost:5432/rehome
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=24h
ADMIN_EMAIL=admin@rehome.com
ADMIN_PASSWORD=secure-password
PORT=3000
NODE_ENV=production
```

### 2. Middleware Requirements
- **Authentication Middleware**: Verify JWT tokens for admin routes
- **Audit Middleware**: Log all admin actions to audit_logs table
- **Validation Middleware**: Validate request bodies using Joi or similar
- **Rate Limiting**: Implement rate limiting for API endpoints
- **CORS**: Configure CORS for frontend domain

### 3. Database Triggers
```sql
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables
CREATE TRIGGER update_furniture_items_updated_at BEFORE UPDATE ON furniture_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_city_base_charges_updated_at BEFORE UPDATE ON city_base_charges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_city_day_data_updated_at BEFORE UPDATE ON city_day_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pricing_config_updated_at BEFORE UPDATE ON pricing_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 4. Initial Data Seeding
The backend should include seeding scripts to populate initial data:
- Default furniture items with categories and points
- City base charges for all supported cities
- City day data for tour schedules
- Default pricing configuration
- Initial admin user

### 5. Security Considerations
- Hash admin passwords using bcrypt
- Implement JWT token blacklisting for logout
- Use parameterized queries to prevent SQL injection
- Validate and sanitize all input data
- Implement proper error handling without exposing sensitive information
- Use HTTPS in production
- Implement request logging for security monitoring

### 6. Performance Optimizations
- Implement Redis caching for frequently accessed data (pricing config, city data)
- Use database connection pooling
- Implement pagination for large datasets
- Add database indexes for frequently queried columns
- Consider implementing GraphQL for more efficient data fetching

### 7. Monitoring and Logging
- Implement structured logging using Winston or similar
- Set up health check endpoints
- Monitor database performance
- Track API response times
- Implement error tracking (Sentry, etc.)

This specification provides a comprehensive foundation for implementing the ReHome pricing system backend. The system is designed to be scalable, maintainable, and secure while providing the flexibility needed for dynamic pricing management. 
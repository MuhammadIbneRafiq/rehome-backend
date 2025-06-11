# ReHome Backend API

## Environment Setup

Create a `.env` file in the backend directory with the following variables:

```env
# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_role_key

# Security
JWT_SECRET=your_jwt_secret_here

# API Keys (optional)
OPENWEATHER_API_KEY=your_openweather_api_key

# Database (if using custom database instead of Supabase)
DATABASE_URL=your_database_connection_string

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Installation

```bash
npm install
```

## Running the Server

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Pricing Management
- `GET /api/admin/pricing-configs` - Get all pricing configurations
- `POST /api/admin/pricing-configs` - Create new pricing configuration
- `PUT /api/admin/pricing-configs/:id` - Update pricing configuration
- `DELETE /api/admin/pricing-configs/:id` - Delete pricing configuration

### City Prices
- `GET /api/admin/city-prices` - Get all city prices
- `POST /api/admin/city-prices` - Create new city price
- `PUT /api/admin/city-prices/:id` - Update city price
- `DELETE /api/admin/city-prices/:id` - Delete city price

### Pricing Multipliers
- `GET /api/admin/pricing-multipliers` - Get all multipliers
- `POST /api/admin/pricing-multipliers` - Create new multiplier
- `PUT /api/admin/pricing-multipliers/:id` - Update multiplier
- `DELETE /api/admin/pricing-multipliers/:id` - Delete multiplier 
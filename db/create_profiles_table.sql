-- Create profiles table for Google OAuth users
CREATE TABLE IF NOT EXISTS profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    google_id VARCHAR(255),
    auth_provider VARCHAR(50) DEFAULT 'email',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sign_in TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_google_id ON profiles(google_id);

-- Create unique constraint that considers both email and auth_provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_auth_provider ON profiles(email, auth_provider);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role to manage profiles (for our custom auth)
CREATE POLICY "Service role can manage profiles" ON profiles
    FOR ALL USING (true);

-- Create policy to allow authenticated users to read profiles
CREATE POLICY "Users can view profiles" ON profiles
    FOR SELECT USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp(); 

-- Create function for upserting profiles
CREATE OR REPLACE FUNCTION upsert_profile(
    p_email VARCHAR(255),
    p_name VARCHAR(255),
    p_avatar_url TEXT,
    p_google_id VARCHAR(255),
    p_auth_provider VARCHAR(50)
) RETURNS profiles AS $$
DECLARE
    v_profile profiles;
BEGIN
    -- Try to update existing profile
    UPDATE profiles
    SET name = p_name,
        avatar_url = p_avatar_url,
        google_id = p_google_id,
        last_sign_in = NOW(),
        updated_at = NOW()
    WHERE email = p_email AND auth_provider = p_auth_provider
    RETURNING * INTO v_profile;

    -- If no profile was updated, insert a new one
    IF v_profile IS NULL THEN
        INSERT INTO profiles (
            email, name, avatar_url, google_id, auth_provider
        ) VALUES (
            p_email, p_name, p_avatar_url, p_google_id, p_auth_provider
        )
        RETURNING * INTO v_profile;
    END IF;

    RETURN v_profile;
END;
$$ LANGUAGE plpgsql; 
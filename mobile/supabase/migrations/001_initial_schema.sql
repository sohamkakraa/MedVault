-- UMA Mobile — Initial Schema
-- Comprehensive PostgreSQL schema for health data, wearable integration, and chat persistence
-- Last updated: 2026-04-11

-- ============================================================================
-- Enable Required Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES TABLE
-- User profile and body metrics
-- ============================================================================

CREATE TABLE public.profiles (
  -- Primary key is the auth.uid() of the authenticated user
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Basic demographics
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  sex TEXT CHECK (sex IN ('male', 'female', 'other', 'prefer-not-to-say')),

  -- Contact info
  email TEXT UNIQUE,
  phone TEXT,
  country_code TEXT,

  -- Healthcare
  primary_care_provider TEXT,
  next_visit_date TIMESTAMPTZ,

  -- Health profile (denormalized for quick access)
  allergies TEXT[] DEFAULT '{}',
  conditions TEXT[] DEFAULT '{}',
  trends TEXT[] DEFAULT '{}', -- Which lab metrics to chart (e.g., ['HbA1c', 'LDL'])
  notes TEXT,

  -- Body measurements (JSON for flexibility across different metrics)
  -- Example: { heightCm: "180", weightKg: "75", waistCm: "90", ... }
  body_metrics JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS
  'User profile and body metrics. Contains PII (name, DOB, contact info) — '
  'encrypted in transit and at rest per HIPAA. No SSN, credit cards, or sensitive IDs stored.';

CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_updated_at ON public.profiles(updated_at DESC);

-- RLS Policy: Users can only read/write their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================================
-- 2. DOCUMENTS TABLE
-- Extracted medical documents (lab reports, prescriptions, imaging, etc.)
-- ============================================================================

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Document metadata
  type TEXT NOT NULL CHECK (type IN ('Lab report', 'Prescription', 'Bill', 'Imaging', 'Other')),
  title TEXT NOT NULL,
  date_iso DATE NOT NULL,
  provider TEXT,
  facility_name TEXT,

  -- Extracted content (from LLM + PDF parser)
  summary TEXT,
  markdown_artifact TEXT, -- Full markdown extraction from PDF

  -- Structured data (from LLM extraction + markdown parsing)
  medications JSONB DEFAULT '[]', -- Array of ExtractedMedication
  labs JSONB DEFAULT '[]',        -- Array of ExtractedLab
  doctors TEXT[] DEFAULT '{}',
  allergies TEXT[] DEFAULT '{}',
  conditions TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',

  -- Document sections (parsed from markdown)
  sections JSONB DEFAULT '[]', -- Array of {title: string, items: string[]}

  -- PDF storage & tracking
  content_hash TEXT, -- SHA256 of original PDF for deduplication
  encrypted_pdf_path TEXT, -- Path to encrypted PDF in storage

  -- Timestamps
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.documents IS
  'Extracted medical documents from uploads. Contains patient health data '
  '(conditions, medications, lab values, allergies) — all HIPAA-protected. '
  'PDFs encrypted in storage; content_hash allows dedup detection.';

CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_user_date ON public.documents(user_id, date_iso DESC);
CREATE INDEX idx_documents_type ON public.documents(user_id, type);
CREATE INDEX idx_documents_content_hash ON public.documents(content_hash) WHERE content_hash IS NOT NULL;

-- RLS Policy: Users can only access their own documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-set user_id on insert
CREATE OR REPLACE FUNCTION public.set_user_id_on_documents_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_documents_set_user_id
  BEFORE INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id_on_documents_insert();

-- ============================================================================
-- 3. MEDICATIONS TABLE
-- Active medication list (denormalized from documents for quick queries)
-- ============================================================================

CREATE TABLE public.medications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Medication details
  name TEXT NOT NULL,
  dose TEXT,
  frequency TEXT,
  route TEXT, -- 'oral', 'injection', 'topical', etc.

  -- Date range
  start_date DATE,
  end_date DATE,

  -- Adherence tracking
  stock_count INT,
  missed_doses INT DEFAULT 0,
  last_missed_iso TIMESTAMPTZ,

  -- Notes from document
  notes TEXT,
  source_doc_id UUID REFERENCES public.documents (id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.medications IS
  'Active medications (denormalized from documents). Contains prescription data — '
  'used to track adherence and send reminders. No NDC codes or sensitive provider IDs.';

CREATE INDEX idx_medications_user_id ON public.medications(user_id);
CREATE INDEX idx_medications_user_active ON public.medications(user_id, end_date);

-- RLS Policy: Users can only manage their own medications
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own medications"
  ON public.medications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert medications"
  ON public.medications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own medications"
  ON public.medications FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-set user_id on insert
CREATE OR REPLACE FUNCTION public.set_user_id_on_medications_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_medications_set_user_id
  BEFORE INSERT ON public.medications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id_on_medications_insert();

-- ============================================================================
-- 4. LABS TABLE
-- Lab values (append-only, deduplicated by name|date|value|unit)
-- ============================================================================

CREATE TABLE public.labs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Lab value details
  name TEXT NOT NULL, -- e.g., 'HbA1c', 'LDL', 'TSH'
  value TEXT NOT NULL,
  unit TEXT,
  ref_range TEXT, -- Reference range (e.g., '4.0-5.5')
  date TEXT NOT NULL, -- ISO date string (YYYY-MM-DD)

  -- Source tracking
  source_doc_id UUID REFERENCES public.documents (id) ON DELETE SET NULL,

  -- Deduplication key
  dedup_key TEXT GENERATED ALWAYS AS (LOWER(name) || '|' || date || '|' || value || '|' || COALESCE(unit, '')) STORED,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.labs IS
  'Lab values (append-only log). Contains test results (glucose, cholesterol, etc.) — '
  'used for charting health trends and detecting anomalies. Deduplicated by content.';

CREATE INDEX idx_labs_user_id ON public.labs(user_id);
CREATE INDEX idx_labs_user_name ON public.labs(user_id, LOWER(name));
CREATE INDEX idx_labs_user_date ON public.labs(user_id, date DESC);
CREATE INDEX idx_labs_dedup ON public.labs(user_id, dedup_key);

-- RLS Policy: Users can only access their own lab values
ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own labs"
  ON public.labs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert labs"
  ON public.labs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Auto-set user_id on insert
CREATE OR REPLACE FUNCTION public.set_user_id_on_labs_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_labs_set_user_id
  BEFORE INSERT ON public.labs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id_on_labs_insert();

-- ============================================================================
-- 5. WEARABLE_DATA TABLE
-- Daily wearable summaries (steps, HR, sleep, SpO2, etc.)
-- ============================================================================

CREATE TABLE public.wearable_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Date (one row per day per source)
  date DATE NOT NULL,

  -- Daily metrics
  steps INT,
  avg_heart_rate NUMERIC(5, 1), -- bpm
  resting_heart_rate NUMERIC(5, 1), -- bpm
  sleep_duration_minutes INT,
  sleep_quality TEXT CHECK (sleep_quality IN ('poor', 'fair', 'good', 'excellent')),
  active_energy_kcal NUMERIC(8, 1),
  avg_spo2 NUMERIC(5, 1), -- %

  -- Raw data (for later enrichment or detailed querying)
  raw_data JSONB DEFAULT '{}',

  -- Source platform
  source TEXT NOT NULL CHECK (source IN ('apple_health', 'health_connect', 'manual', 'garmin', 'fitbit')),

  -- Timestamps
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.wearable_data IS
  'Daily wearable summaries (steps, heart rate, sleep, SpO2, active energy). '
  'No PII beyond user_id; used for health trend analysis and anomaly detection.';

CREATE UNIQUE INDEX idx_wearable_data_user_date_source ON public.wearable_data(user_id, date, source);
CREATE INDEX idx_wearable_data_user_date ON public.wearable_data(user_id, date DESC);
CREATE INDEX idx_wearable_data_synced ON public.wearable_data(synced_at DESC);

-- RLS Policy: Users can only access their own wearable data
ALTER TABLE public.wearable_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wearable data"
  ON public.wearable_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert wearable data"
  ON public.wearable_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wearable data"
  ON public.wearable_data FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-set user_id on insert
CREATE OR REPLACE FUNCTION public.set_user_id_on_wearable_data_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_wearable_data_set_user_id
  BEFORE INSERT ON public.wearable_data
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id_on_wearable_data_insert();

-- ============================================================================
-- 6. CHAT_MESSAGES TABLE
-- Conversation history (for multi-turn agent conversations)
-- ============================================================================

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Agent context
  agent_id TEXT, -- e.g., 'health-companion', 'medication-tracker', etc.

  -- Message metadata
  metadata JSONB DEFAULT '{}', -- {citations?, confidence?, consultDoctor?, needsClarification?}

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.chat_messages IS
  'Conversation history for agent chats. Contains user questions and AI responses. '
  'No PII in content (messages are about health data, not identity). Used for context '
  'window management and conversation continuity.';

CREATE INDEX idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX idx_chat_messages_user_agent ON public.chat_messages(user_id, agent_id);
CREATE INDEX idx_chat_messages_user_date ON public.chat_messages(user_id, created_at DESC);

-- RLS Policy: Users can only access their own chat history
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chat messages"
  ON public.chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert chat messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Auto-set user_id on insert
CREATE OR REPLACE FUNCTION public.set_user_id_on_chat_messages_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_chat_messages_set_user_id
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id_on_chat_messages_insert();

-- ============================================================================
-- 7. NOTIFICATIONS TABLE
-- Scheduled notifications (medication reminders, appointment alerts, etc.)
-- ============================================================================

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Notification type
  type TEXT NOT NULL CHECK (
    type IN ('medication_reminder', 'injection_due', 'wellness_checkin',
             'appointment_reminder', 'lab_anomaly', 'wearable_alert')
  ),

  -- Content
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Scheduling
  scheduled_iso TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT TRUE,

  -- Recurrence (if any)
  -- Example: { interval: 'daily', times: ['09:00', '20:00'] }
  recurring JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.notifications IS
  'Scheduled notifications for reminders and alerts. Contains non-sensitive '
  'titles and bodies (e.g., "Take Metformin"). No PHI beyond user association. '
  'Used for medication adherence and appointment tracking.';

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_user_active ON public.notifications(user_id, active) WHERE active = TRUE;
CREATE INDEX idx_notifications_scheduled ON public.notifications(scheduled_iso) WHERE active = TRUE;

-- RLS Policy: Users can only manage their own notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-set user_id on insert
CREATE OR REPLACE FUNCTION public.set_user_id_on_notifications_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notifications_set_user_id
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id_on_notifications_insert();

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Function to get recent documents (for dashboard queries)
CREATE OR REPLACE FUNCTION public.get_recent_documents(
  p_user_id UUID DEFAULT auth.uid(),
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  date_iso DATE,
  provider TEXT,
  summary TEXT,
  uploaded_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
    SELECT d.id, d.type, d.title, d.date_iso, d.provider, d.summary, d.uploaded_at
    FROM public.documents d
    WHERE d.user_id = p_user_id
    ORDER BY d.date_iso DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get active medications
CREATE OR REPLACE FUNCTION public.get_active_medications(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  dose TEXT,
  frequency TEXT,
  start_date DATE,
  end_date DATE
) AS $$
BEGIN
  RETURN QUERY
    SELECT m.id, m.name, m.dose, m.frequency, m.start_date, m.end_date
    FROM public.medications m
    WHERE m.user_id = p_user_id
      AND (m.end_date IS NULL OR m.end_date > CURRENT_DATE)
    ORDER BY m.start_date DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 9. UPDATED_AT TRIGGERS
-- Automatically update the updated_at timestamp on row modification
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_medications_updated_at
  BEFORE UPDATE ON public.medications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

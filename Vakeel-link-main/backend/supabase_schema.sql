-- Run this script in the Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE public.consultation_status AS ENUM ('pending', 'active', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.citation_type_enum AS ENUM ('section', 'case', 'act');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.document_type_enum AS ENUM ('bar_certificate', 'case_brief', 'evidence', 'other');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.reported_entity_type_enum AS ENUM ('lawyer', 'consultation', 'message');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.report_status_enum AS ENUM ('open', 'under_review', 'resolved', 'dismissed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.notification_type_enum AS ENUM ('approval', 'rejection', 'consultation_request', 'consultation_accepted', 'new_message', 'review_prompt');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.lawyers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    specialization TEXT,
    location TEXT,
    experience_years INTEGER,
    rating NUMERIC DEFAULT 0,
    bio TEXT,
    areas_of_practice TEXT[],
    fee_per_consultation INTEGER,
    is_verified BOOLEAN DEFAULT FALSE,
    profile_image_url TEXT,
    is_online BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.lawyer_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lawyer_id UUID REFERENCES public.lawyers(id) ON DELETE CASCADE,
    day_of_week TEXT,
    start_time TEXT,
    end_time TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.lawyer_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lawyer_id UUID REFERENCES public.lawyers(id) ON DELETE CASCADE,
    reviewer_name TEXT,
    rating INTEGER,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'lawyer', 'admin')),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin
ON public.profiles
FOR SELECT
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.query_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    domain TEXT NOT NULL,
    answer JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS query_history_user_id_idx ON public.query_history(user_id);
CREATE INDEX IF NOT EXISTS query_history_domain_idx ON public.query_history(domain);
CREATE INDEX IF NOT EXISTS query_history_created_at_idx ON public.query_history(created_at);

ALTER TABLE public.query_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS query_history_select_own ON public.query_history;
CREATE POLICY query_history_select_own
ON public.query_history
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS query_history_select_admin ON public.query_history;
CREATE POLICY query_history_select_admin
ON public.query_history
FOR SELECT
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS query_history_insert_own ON public.query_history;
CREATE POLICY query_history_insert_own
ON public.query_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lawyer_id UUID NOT NULL REFERENCES public.lawyers(id) ON DELETE CASCADE,
    status public.consultation_status NOT NULL DEFAULT 'pending',
    domain TEXT NOT NULL,
    ai_query_id UUID REFERENCES public.query_history(id) ON DELETE SET NULL,
    client_message TEXT,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    mode TEXT DEFAULT 'chat',
    meeting_url TEXT,
    location TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Safe upgrades for existing databases
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS client_message TEXT;
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'chat';
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS meeting_url TEXT;
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS location TEXT;

CREATE INDEX IF NOT EXISTS consultations_user_id_idx ON public.consultations(user_id);
CREATE INDEX IF NOT EXISTS consultations_lawyer_id_idx ON public.consultations(lawyer_id);
CREATE INDEX IF NOT EXISTS consultations_status_idx ON public.consultations(status);
CREATE INDEX IF NOT EXISTS consultations_created_at_idx ON public.consultations(created_at);
CREATE INDEX IF NOT EXISTS consultations_ai_query_id_idx ON public.consultations(ai_query_id);
CREATE INDEX IF NOT EXISTS consultations_scheduled_at_idx ON public.consultations(scheduled_at);

ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultations_select_own ON public.consultations;
CREATE POLICY consultations_select_own
ON public.consultations
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS consultations_select_lawyer ON public.consultations;
CREATE POLICY consultations_select_lawyer
ON public.consultations
FOR SELECT
USING (auth.uid() = lawyer_id);

DROP POLICY IF EXISTS consultations_select_admin ON public.consultations;
CREATE POLICY consultations_select_admin
ON public.consultations
FOR SELECT
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP TRIGGER IF EXISTS set_consultations_updated_at ON public.consultations;
CREATE TRIGGER set_consultations_updated_at
BEFORE UPDATE ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.ai_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id UUID NOT NULL REFERENCES public.query_history(id) ON DELETE CASCADE,
    citation_type public.citation_type_enum NOT NULL,
    citation_text TEXT NOT NULL,
    source_collection TEXT NOT NULL,
    relevance_score DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS ai_citations_query_id_idx ON public.ai_citations(query_id);
CREATE INDEX IF NOT EXISTS ai_citations_created_at_idx ON public.ai_citations(created_at);

ALTER TABLE public.ai_citations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_citations_select_own ON public.ai_citations;
CREATE POLICY ai_citations_select_own
ON public.ai_citations
FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.query_history q
    WHERE q.id = ai_citations.query_id AND q.user_id = auth.uid()
));

DROP POLICY IF EXISTS ai_citations_select_admin ON public.ai_citations;
CREATE POLICY ai_citations_select_admin
ON public.ai_citations
FOR SELECT
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Client ↔ lawyer consultation chat (used by WS /api/v1/chat/ws/{consultation_id})
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS chat_messages_consultation_id_idx ON public.chat_messages(consultation_id);
CREATE INDEX IF NOT EXISTS chat_messages_sender_id_idx ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON public.chat_messages(created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_select_member ON public.chat_messages;
CREATE POLICY chat_messages_select_member
ON public.chat_messages
FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.consultations c
    WHERE c.id = chat_messages.consultation_id
      AND (c.user_id = auth.uid() OR c.lawyer_id = auth.uid())
));

DROP POLICY IF EXISTS chat_messages_insert_member ON public.chat_messages;
CREATE POLICY chat_messages_insert_member
ON public.chat_messages
FOR INSERT
WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.consultations c
        WHERE c.id = chat_messages.consultation_id
          AND (c.user_id = auth.uid() OR c.lawyer_id = auth.uid())
    )
);

-- AI assistant sessions (separate from consultation chat_messages)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    domain_identified TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS chat_sessions_user_id_idx ON public.chat_sessions(user_id);

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    citations JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS ai_chat_messages_session_id_idx ON public.ai_chat_messages(session_id);

CREATE TABLE IF NOT EXISTS public.archived_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
    archived_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    archive_reason TEXT,
    full_chat_log JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS archived_chats_consultation_id_idx ON public.archived_chats(consultation_id);
CREATE INDEX IF NOT EXISTS archived_chats_archived_by_idx ON public.archived_chats(archived_by);
CREATE INDEX IF NOT EXISTS archived_chats_created_at_idx ON public.archived_chats(created_at);

ALTER TABLE public.archived_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archived_chats_select_own ON public.archived_chats;
CREATE POLICY archived_chats_select_own
ON public.archived_chats
FOR SELECT
USING (EXISTS (
    SELECT 1
    FROM public.consultations c
    WHERE c.id = archived_chats.consultation_id
      AND c.user_id = auth.uid()
));

DROP POLICY IF EXISTS archived_chats_select_lawyer ON public.archived_chats;
CREATE POLICY archived_chats_select_lawyer
ON public.archived_chats
FOR SELECT
USING (EXISTS (
    SELECT 1
    FROM public.consultations c
    WHERE c.id = archived_chats.consultation_id
      AND c.lawyer_id = auth.uid()
));

DROP POLICY IF EXISTS archived_chats_select_admin ON public.archived_chats;
CREATE POLICY archived_chats_select_admin
ON public.archived_chats
FOR SELECT
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE TABLE IF NOT EXISTS public.archived_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lawyer_id UUID REFERENCES public.lawyers(id) ON DELETE SET NULL,
    document_name TEXT NOT NULL,
    document_type public.document_type_enum NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS archived_documents_user_id_idx ON public.archived_documents(user_id);
CREATE INDEX IF NOT EXISTS archived_documents_lawyer_id_idx ON public.archived_documents(lawyer_id);
CREATE INDEX IF NOT EXISTS archived_documents_archived_at_idx ON public.archived_documents(archived_at);

ALTER TABLE public.archived_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archived_documents_select_own ON public.archived_documents;
CREATE POLICY archived_documents_select_own
ON public.archived_documents
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS archived_documents_select_lawyer ON public.archived_documents;
CREATE POLICY archived_documents_select_lawyer
ON public.archived_documents
FOR SELECT
USING (auth.uid() = lawyer_id);

DROP POLICY IF EXISTS archived_documents_select_admin ON public.archived_documents;
CREATE POLICY archived_documents_select_admin
ON public.archived_documents
FOR SELECT
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE TABLE IF NOT EXISTS public.reported_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reported_entity_type public.reported_entity_type_enum NOT NULL,
    reported_entity_id UUID NOT NULL,
    reason TEXT NOT NULL,
    status public.report_status_enum NOT NULL DEFAULT 'open',
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS reported_issues_reported_by_idx ON public.reported_issues(reported_by);
CREATE INDEX IF NOT EXISTS reported_issues_status_idx ON public.reported_issues(status);
CREATE INDEX IF NOT EXISTS reported_issues_created_at_idx ON public.reported_issues(created_at);

ALTER TABLE public.reported_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reported_issues_select_own ON public.reported_issues;
CREATE POLICY reported_issues_select_own
ON public.reported_issues
FOR SELECT
USING (auth.uid() = reported_by);

DROP POLICY IF EXISTS reported_issues_select_admin ON public.reported_issues;
CREATE POLICY reported_issues_select_admin
ON public.reported_issues
FOR SELECT
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP TRIGGER IF EXISTS set_reported_issues_updated_at ON public.reported_issues;
CREATE TRIGGER set_reported_issues_updated_at
BEFORE UPDATE ON public.reported_issues
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type public.notification_type_enum NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_select_admin ON public.notifications;
CREATE POLICY notifications_select_admin
ON public.notifications
FOR SELECT
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Note: You might want to enable Row Level Security and add policies depending on your overall setup.
-- ALTER TABLE public.lawyers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.lawyer_availability ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.lawyer_reviews ENABLE ROW LEVEL SECURITY;

-- Mock seed data for VakeelLink.
-- Inserts only; no schema changes.

INSERT INTO public.profiles (id, email, full_name, phone_number, role, created_at, updated_at) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@vakeellink.in', 'Admin VakeelLink', '9999900000', 'admin', NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days'),
('u0000000-0000-0000-0000-000000000001', 'ravi.kumar@gmail.com', 'Ravi Kumar', '9876543210', 'client', NOW() - INTERVAL '95 days', NOW() - INTERVAL '95 days'),
('u0000000-0000-0000-0000-000000000002', 'anita.desai@gmail.com', 'Anita Desai', '9812345678', 'client', NOW() - INTERVAL '90 days', NOW() - INTERVAL '90 days'),
('u0000000-0000-0000-0000-000000000003', 'suresh.pillai@gmail.com', 'Suresh Pillai', '9845001234', 'client', NOW() - INTERVAL '88 days', NOW() - INTERVAL '88 days'),
('l0000000-0000-0000-0000-000000000001', 'priya.sharma@legalmail.in', 'Adv. Priya Sharma', '9811100001', 'lawyer', NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days'),
('l0000000-0000-0000-0000-000000000002', 'rahul.mehta@legalmail.in', 'Adv. Rahul Mehta', '9822200002', 'lawyer', NOW() - INTERVAL '90 days', NOW() - INTERVAL '90 days'),
('l0000000-0000-0000-0000-000000000003', 'sunita.reddy@legalmail.in', 'Adv. Sunita Reddy', '9833300003', 'lawyer', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
('l0000000-0000-0000-0000-000000000004', 'vikram.singh@legalmail.in', 'Adv. Vikram Singh', '9844400004', 'lawyer', NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days'),
('l0000000-0000-0000-0000-000000000005', 'meera.iyer@legalmail.in', 'Adv. Meera Iyer', '9855500005', 'lawyer', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
('l0000000-0000-0000-0000-000000000006', 'arjun.kapoor@legalmail.in', 'Adv. Arjun Kapoor', '9866600006', 'lawyer', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
('l0000000-0000-0000-0000-000000000007', 'fatima.sheikh@legalmail.in', 'Adv. Fatima Sheikh', '9877700007', 'lawyer', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lawyers (id, name, specialization, location, experience_years, rating, bio, areas_of_practice, fee_per_consultation, is_verified, profile_image_url, is_online, created_at) VALUES
('l0000000-0000-0000-0000-000000000001', 'Adv. Priya Sharma', 'Family, Constitutional', 'Delhi', 8, 4.7, 'Experienced family law practitioner with expertise in matrimonial disputes, custody battles, and constitutional matters. Alumni of Delhi University Law Faculty.', ARRAY['Divorce', 'Child Custody', 'Maintenance', 'Fundamental Rights'], 500, TRUE, NULL, TRUE, NOW() - INTERVAL '60 days'),
('l0000000-0000-0000-0000-000000000002', 'Adv. Rahul Mehta', 'Criminal, Consumer', 'Mumbai', 12, 4.5, 'Senior criminal defense lawyer with 12 years of trial experience across Sessions and High Courts. Also handles consumer disputes and RERA matters.', ARRAY['Bail Applications', 'Criminal Defense', 'Consumer Complaints', 'RERA'], 800, TRUE, NULL, FALSE, NOW() - INTERVAL '90 days'),
('l0000000-0000-0000-0000-000000000003', 'Adv. Sunita Reddy', 'Labour, Constitutional', 'Hyderabad', 6, 4.8, 'Labour law specialist with a strong track record in industrial tribunal cases, wrongful termination, and ESIC/PF disputes. Constitutional law background.', ARRAY['Wrongful Termination', 'PF/ESIC Disputes', 'Industrial Tribunal', 'Writ Petitions'], 400, TRUE, NULL, TRUE, NOW() - INTERVAL '45 days'),
('l0000000-0000-0000-0000-000000000004', 'Adv. Vikram Singh', 'Motor Accident, Criminal', 'Chandigarh', 15, 4.3, 'Highly experienced in motor accident claims under the MV Act, insurance disputes, and criminal trials. Punjab & Haryana High Court practitioner.', ARRAY['Motor Accident Claims', 'Insurance Disputes', 'Criminal Trials', 'Bail'], 600, TRUE, NULL, FALSE, NOW() - INTERVAL '120 days'),
('l0000000-0000-0000-0000-000000000005', 'Adv. Meera Iyer', 'Consumer, Family', 'Chennai', 9, 4.9, 'Top-rated consumer rights advocate and family law expert. Specializes in e-commerce disputes, deficiency of service, and NRI divorce matters.', ARRAY['Consumer Forum', 'E-Commerce Disputes', 'NRI Divorce', 'Domestic Violence'], 550, TRUE, NULL, TRUE, NOW() - INTERVAL '30 days'),
('l0000000-0000-0000-0000-000000000006', 'Adv. Arjun Kapoor', 'Criminal', 'Delhi', 4, NULL, 'Fresh criminal law practitioner with district court experience. Completed LLB from Amity Law School. Eager to serve clients on VakeelLink.', ARRAY['Criminal Defense', 'Bail Applications'], 300, FALSE, NULL, FALSE, NOW() - INTERVAL '2 days'),
('l0000000-0000-0000-0000-000000000007', 'Adv. Fatima Sheikh', 'Family, Consumer', 'Mumbai', 7, NULL, 'Family and consumer law practitioner from Mumbai. Handles divorce, maintenance, and consumer forum cases. Fluent in Urdu and Hindi.', ARRAY['Divorce', 'Maintenance', 'Consumer Complaints'], 450, FALSE, NULL, FALSE, NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lawyer_availability (id, lawyer_id, day_of_week, start_time, end_time, created_at) VALUES
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000001', 'Monday', '10:00', '13:00', NOW() - INTERVAL '58 days'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000001', 'Thursday', '16:00', '19:00', NOW() - INTERVAL '57 days'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000002', 'Tuesday', '11:00', '14:00', NOW() - INTERVAL '89 days'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000003', 'Wednesday', '09:30', '12:30', NOW() - INTERVAL '44 days'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000004', 'Friday', '15:00', '18:00', NOW() - INTERVAL '118 days'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000005', 'Monday', '18:00', '20:00', NOW() - INTERVAL '29 days'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000006', 'Saturday', '10:00', '13:00', NOW() - INTERVAL '1 day'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000007', 'Sunday', '11:00', '14:00', NOW() - INTERVAL '2 days');

INSERT INTO public.query_history (id, user_id, query, domain, answer, created_at) VALUES
('q0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000001', 'My husband abandoned me and is not paying maintenance. What are my rights?', '{"analysis":"Under Section 125 CrPC, a wife unable to maintain herself is entitled to claim maintenance from her husband. Desertion for the required statutory period can also support divorce proceedings under the Hindu Marriage Act.","cited_sections":["Section 125 CrPC","Section 13 Hindu Marriage Act 1955"],"cited_cases":["Rajnesh v. Neha (2020 SC)"],"cited_acts":["Hindu Marriage Act 1955","Code of Criminal Procedure"],"confidence_score":0.84,"disclaimer":"This is AI-generated legal guidance, not legal advice. Please consult a verified lawyer."}', NOW() - INTERVAL '21 days'),
('q0000000-0000-0000-0000-000000000002', 'u0000000-0000-0000-0000-000000000002', 'E-commerce company refusing refund despite warranty. What can I do?', '{"analysis":"Under the Consumer Protection Act 2019, a consumer can file a complaint before the District Consumer Disputes Redressal Commission for deficiency in service or defective goods. You may seek replacement, repair, or a full refund depending on the facts.","cited_sections":["Section 2(7) - Consumer Definition","Section 35 - Consumer Complaint"],"cited_cases":["Amazon Seller Services v. Amway India (2021)"],"cited_acts":["Consumer Protection Act 2019"],"confidence_score":0.91,"disclaimer":"This is AI-generated legal guidance, not legal advice. Please consult a verified lawyer."}', NOW() - INTERVAL '6 days'),
('q0000000-0000-0000-0000-000000000003', 'u0000000-0000-0000-0000-000000000003', 'Insurance company giving very low settlement after motor accident. Can I fight it?', '{"analysis":"Under Section 166 of the Motor Vehicles Act 1988, you can file a claim petition before the Motor Accident Claims Tribunal. Compensation may include medical expenses, loss of income, pain and suffering, and disability-related losses.","cited_sections":["Section 166 MV Act","Section 168 MV Act"],"cited_cases":["National Insurance Co. v. Pranay Sethi (2017 SC)"],"cited_acts":["Motor Vehicles Act 1988"],"confidence_score":0.88,"disclaimer":"This is AI-generated legal guidance, not legal advice. Please consult a verified lawyer."}', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_citations (id, query_id, citation_type, citation_text, source_collection, relevance_score, created_at) VALUES
(gen_random_uuid(), 'q0000000-0000-0000-0000-000000000001', 'section', 'Section 125 CrPC - maintenance for wife, children, and parents', 'bare_acts', 0.97, NOW() - INTERVAL '21 days'),
(gen_random_uuid(), 'q0000000-0000-0000-0000-000000000001', 'case', 'Rajnesh v. Neha (2020 SC)', 'case_law', 0.92, NOW() - INTERVAL '21 days'),
(gen_random_uuid(), 'q0000000-0000-0000-0000-000000000002', 'act', 'Consumer Protection Act 2019', 'bare_acts', 0.95, NOW() - INTERVAL '6 days'),
(gen_random_uuid(), 'q0000000-0000-0000-0000-000000000003', 'section', 'Section 166 Motor Vehicles Act 1988', 'bare_acts', 0.96, NOW() - INTERVAL '2 days');

INSERT INTO public.consultations (id, user_id, lawyer_id, status, domain, ai_query_id, created_at, updated_at) VALUES
('c0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000001', 'l0000000-0000-0000-0000-000000000001', 'completed', 'legal_family', 'q0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '20 days', NOW() - INTERVAL '18 days'),
('c0000000-0000-0000-0000-000000000002', 'u0000000-0000-0000-0000-000000000002', 'l0000000-0000-0000-0000-000000000005', 'active', 'legal_consumer', 'q0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 day'),
('c0000000-0000-0000-0000-000000000003', 'u0000000-0000-0000-0000-000000000003', 'l0000000-0000-0000-0000-000000000004', 'pending', 'legal_motor_accident', 'q0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lawyer_reviews (id, lawyer_id, reviewer_name, rating, comment, created_at) VALUES
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000001', 'Ravi Kumar', 5, 'Adv. Priya Sharma was extremely helpful. She explained my rights clearly and helped me file for maintenance successfully. Highly recommended.', NOW() - INTERVAL '15 days'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000005', 'Anita Desai', 5, 'Adv. Meera Iyer got me a full refund from the e-commerce company within 3 weeks. Professional and thorough.', NOW() - INTERVAL '3 days'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000002', 'Ravi Kumar', 4, 'Adv. Rahul Mehta handled my brother''s bail application efficiently. Good knowledge of criminal procedure. Would consult again.', NOW() - INTERVAL '40 days');

INSERT INTO public.notifications (id, user_id, type, title, body, is_read, metadata, created_at) VALUES
(gen_random_uuid(), 'u0000000-0000-0000-0000-000000000001', 'review_prompt', 'Consultation Completed', 'Your consultation with Adv. Priya Sharma has been marked complete. Please leave a review.', TRUE, '{"consultation_id":"c0000000-0000-0000-0000-000000000001"}', NOW() - INTERVAL '18 days'),
(gen_random_uuid(), 'u0000000-0000-0000-0000-000000000002', 'consultation_accepted', 'Lawyer Accepted Request', 'Adv. Meera Iyer has accepted your consultation request. You can now chat.', TRUE, '{"consultation_id":"c0000000-0000-0000-0000-000000000002"}', NOW() - INTERVAL '4 days'),
(gen_random_uuid(), 'u0000000-0000-0000-0000-000000000003', 'consultation_request', 'Consultation Request Sent', 'Your consultation request has been sent to Adv. Vikram Singh. Awaiting acceptance.', FALSE, '{"consultation_id":"c0000000-0000-0000-0000-000000000003"}', NOW() - INTERVAL '1 day'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000001', 'consultation_request', 'New Consultation Request', 'You have a new consultation request from a client regarding Family Law.', TRUE, '{"consultation_id":"c0000000-0000-0000-0000-000000000001"}', NOW() - INTERVAL '21 days'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000006', 'approval', 'Application Under Review', 'Your VakeelLink lawyer application is currently under admin review. You will be notified once a decision is made.', FALSE, '{"application_status":"pending"}', NOW() - INTERVAL '2 days'),
(gen_random_uuid(), 'l0000000-0000-0000-0000-000000000007', 'approval', 'Application Under Review', 'Your VakeelLink lawyer application is currently under admin review. You will be notified once a decision is made.', FALSE, '{"application_status":"pending"}', NOW() - INTERVAL '3 days');

INSERT INTO public.archived_chats (id, consultation_id, archived_by, archive_reason, full_chat_log, created_at) VALUES
(gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Consultation completed and moved to archive for audit trail.', '[{"role":"user","message":"My husband abandoned me for 2 years and refuses to pay maintenance."},{"role":"lawyer","message":"You can seek maintenance under Section 125 CrPC and consider divorce on desertion grounds."}]'::jsonb, NOW() - INTERVAL '17 days');

INSERT INTO public.archived_documents (id, user_id, lawyer_id, document_name, document_type, storage_path, uploaded_at, archived_at, archived_by) VALUES
(gen_random_uuid(), 'u0000000-0000-0000-0000-000000000001', 'l0000000-0000-0000-0000-000000000001', 'Marriage Certificate.pdf', 'evidence', 'documents/ravi-kumar/marriage-certificate.pdf', NOW() - INTERVAL '22 days', NOW() - INTERVAL '16 days', 'a0000000-0000-0000-0000-000000000001'),
(gen_random_uuid(), 'u0000000-0000-0000-0000-000000000003', 'l0000000-0000-0000-0000-000000000004', 'Insurance Claim Letter.pdf', 'case_brief', 'documents/suresh-pillai/insurance-claim-letter.pdf', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day', 'a0000000-0000-0000-0000-000000000001');

INSERT INTO public.reported_issues (id, reported_by, reported_entity_type, reported_entity_id, reason, status, resolved_by, resolution_note, created_at, updated_at) VALUES
(gen_random_uuid(), 'u0000000-0000-0000-0000-000000000001', 'lawyer', 'l0000000-0000-0000-0000-000000000002', 'unprofessional_behavior', 'open', NULL, 'The lawyer was dismissive and did not properly respond to my queries during the consultation session.', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days');

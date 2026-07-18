-- Apply in Supabase SQL editor if the main schema was already deployed.
-- Extends consultations + adds consultation chat_messages + AI chat tables.

ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS client_message TEXT;
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'chat';
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS meeting_url TEXT;
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS location TEXT;

CREATE INDEX IF NOT EXISTS consultations_scheduled_at_idx ON public.consultations(scheduled_at);

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

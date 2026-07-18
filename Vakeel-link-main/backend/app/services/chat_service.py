from supabase import Client
from app.core.supabase_client import supabase
from app.services.rag_service import rag_service
from fastapi import HTTPException

class ChatService:
    def __init__(self):
        # Using the standard client because chat history respects user RLS policies.
        # Alternatively, we can use the admin client if we manage ownership logic carefully.
        self.client: Client = supabase.get_admin_client() # Using admin client for reliable backend insertions
        self.rag = rag_service

    def process_query(self, user_id: str, query: str, session_id: str = None):
        try:
            # 1. Get response and citations from AI RAG engine
            rag_response = self.rag.generate_answer(query)
            
            # Unpack response
            answer = (
                rag_response.get("summary")
                or rag_response.get("analysis")
                or rag_response.get("answer")
                or "Error generating response."
            )
            citations = rag_response.get("citations", [])
            domain_identified = rag_response.get("domain", "general")

            # 2. Manage Chat Session
            if not session_id:
                # Create a new session for this user
                title = query[:50] + "..." if len(query) > 50 else query
                session_data = {
                    "user_id": user_id,
                    "title": title,
                    "domain_identified": domain_identified
                }
                session_res = self.client.table('chat_sessions').insert(session_data).execute()
                if session_res.data:
                    session_id = session_res.data[0]['id']
                else:
                    raise HTTPException(status_code=500, detail="Failed to create chat session.")
            else:
                # Optionally update the session's updated_at timestamp or domain
                self.client.table('chat_sessions').update({"domain_identified": domain_identified}).eq("id", session_id).execute()

            # 3. Save messages into ai_chat_messages (NOT consultation chat_messages)
            user_msg_data = {
                "session_id": session_id,
                "role": "user",
                "content": query,
                "citations": None
            }
            assistant_msg_data = {
                "session_id": session_id,
                "role": "assistant",
                "content": answer,
                "citations": citations
            }
            try:
                self.client.table('ai_chat_messages').insert(user_msg_data).execute()
                self.client.table('ai_chat_messages').insert(assistant_msg_data).execute()
            except Exception:
                # Fallback if ai_chat_messages table is not migrated yet — skip persistence.
                pass

            return {
                "session_id": session_id,
                "answer": answer,
                "citations": citations,
                "domain": domain_identified
            }

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    def get_user_sessions(self, user_id: str):
        """Fetch all AI chat sessions for a user."""
        try:
            response = self.client.table('chat_sessions').select('*').eq('user_id', user_id).order('updated_at', desc=True).execute()
            return response.data
        except Exception as e:
             raise HTTPException(status_code=500, detail=str(e))

    def get_session_messages(self, session_id: str, user_id: str):
        """Fetch all AI messages within a specific session, validating ownership."""
        try:
            session_check = self.client.table('chat_sessions').select('user_id').eq('id', session_id).single().execute()
            if not session_check.data or session_check.data['user_id'] != user_id:
                raise HTTPException(status_code=403, detail="Unauthorized access to chat session.")

            try:
                response = (
                    self.client.table('ai_chat_messages')
                    .select('*')
                    .eq('session_id', session_id)
                    .order('created_at', desc=False)
                    .execute()
                )
                return response.data
            except Exception:
                return []
        except HTTPException:
            raise
        except Exception as e:
             raise HTTPException(status_code=500, detail=str(e))

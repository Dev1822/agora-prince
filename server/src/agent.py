"""
Agent

High-level API for managing Agora Conversational AI Agents.
"""
import logging
import os
import time
from typing import Any, Dict, Optional

from agora_agent import Area, AsyncAgora
from agora_agent.agentkit import Agent as AgoraAgent
from agora_agent.agentkit.vendors import DeepgramSTT, MiniMaxTTS, OpenAI

logger = logging.getLogger("uvicorn.error")

INCIDENT_COMMANDER_PROMPT = """
You are Ada, an AI Incident Commander and Developer Advocate from Agora.

Your job is to help developers investigate production incidents, understand system health, and coordinate incident response.

CORE BEHAVIOR:
- Be calm, concise, and action-oriented.
- When a user reports a production problem, investigate it instead of guessing.
- Use the available incident-management tools whenever they can provide useful information.
- Never claim that an action was completed unless the corresponding tool confirms success.
- Clearly distinguish between facts returned by tools and your own reasoning.
- Prefer taking useful actions over merely describing what could be done.

INCIDENT INVESTIGATION:
1. When a user reports a service problem, identify the affected service if possible.
2. Use get_service_health to check the affected service.
3. Use get_active_incidents to determine whether an appropriate incident already exists.
4. Do not create a duplicate incident if an active incident already covers the same problem.
5. If the situation warrants a new incident, use create_incident.
6. Include the affected service and known impact when creating an incident whenever that information is available.
7. After creating an incident, report the incident ID and severity.
8. Record confirmed findings as facts using add_incident_fact and working theories as hypotheses using add_incident_hypothesis.
9. Record important investigation notes using add_incident_note.
10. If an existing incident is relevant, continue working with that incident instead of creating another one.

FACTS vs HYPOTHESES:
- CONFIRMED FACTS:
  Use add_incident_fact whenever information is confirmed by:
  • service health tools (e.g., error rates, latencies, status)
  • incident evidence and verified metrics
  Include confidence (high/medium/low) and evidence source when available.
- WORKING HYPOTHESES:
  Use add_incident_hypothesis when proposing a possible cause or theory that is not yet verified.
  Never represent an unverified hypothesis as a confirmed fact.
- HYPOTHESIS VERIFICATION:
  When new evidence confirms a hypothesis, use verify_hypothesis(incident_id, hypothesis_id, "confirmed").
  When evidence disproves a hypothesis, use verify_hypothesis(incident_id, hypothesis_id, "rejected").
  Always prefer tool-returned evidence over assumptions.

CRITICAL REMEDIATIONS & HUMAN CONFIRMATION:
- High-risk operational remediations (e.g. database failover, cluster scaling, cache flushing, service restarts) require human authorization.
- When such an action is appropriate, use request_critical_action(incident_id, action, target_resource, risk_level, details).
- Never claim that a risky action was executed merely because approval was requested.
- State clearly to the developer that human approval is required and has been submitted to the dashboard for authorization.
- Continue investigating or monitoring while approval is pending.

SERVICE HEALTH:
- Use get_service_health when checking a specific service.
- Use get_all_service_health when the user asks for an overall system health picture.
- Do not invent metrics, outages, or service states.
- Treat tool-returned service health as operational evidence.
- If a service is degraded, explain the relevant metrics briefly and record confirmed facts.

INCIDENT STATUS AND LIFECYCLE:
- Use get_incident_status when the user provides or asks about a specific incident ID.
- Use get_incident_summary when the user wants a concise overview of an incident.
- Incident lifecycle states are:
  investigating → identified → monitoring → resolved
- Use update_incident_status when the investigation meaningfully changes the incident state.
- When evidence identifies a likely root cause, move the incident to identified and record the root cause when appropriate.
- When the issue appears fixed but requires observation, move the incident to monitoring.
- When the issue is confirmed resolved, move the incident to resolved.
- Do not mark an incident resolved merely because the user says they hope it is fixed; use available evidence.
- Record important lifecycle changes and investigation findings with add_incident_note when useful.

POST-MORTEM & INCIDENT REPORTS:
- Use generate_incident_postmortem when an incident has been resolved or when the developer requests a post-mortem, debrief, or incident summary report.
- Summarize confirmed facts, root cause, and remediation actions concisely, and let the operator know the full markdown post-mortem is accessible in the dashboard.

SEVERITY:
Use these severity levels:
- low: minor issue with limited impact
- medium: meaningful degradation affecting some users
- high: major production impact
- critical: severe or widespread production outage

When severity is unclear, ask a concise clarifying question unless the available evidence strongly indicates an appropriate severity.

Use available service health, error rates, latency, incident scope, and user impact as evidence when reasoning about severity.

TOOL DISCIPLINE:
- Prefer checking existing incidents before creating a new one.
- Use tools when they provide information you cannot reliably know yourself.
- Do not repeatedly call the same tool without a reason.
- Use the smallest number of tool calls needed to make a reliable decision.
- If a tool returns an error, explain the problem rather than pretending it succeeded.
- Never fabricate incident IDs, metrics, root causes, statuses, or successful actions.
- When a tool action succeeds, use its returned data in your response.
- When a tool action fails, clearly state that it failed and why if known.

AUTONOMOUS RESPONSE FLOW:
For a clear production incident, prefer this sequence:
1. Investigate the affected service.
2. Check for existing active incidents.
3. Determine whether the issue is already tracked.
4. If necessary, create an incident with an appropriate severity.
5. Record confirmed facts and working hypotheses using add_incident_fact and add_incident_hypothesis.
6. Verify or reject hypotheses as evidence becomes available using verify_hypothesis.
7. Update the incident lifecycle as evidence changes.
8. Give the user a concise operational summary and next step.

Do not ask for confirmation before every tool action when the user's request clearly authorizes the action and the action is safe and reversible.

COMMUNICATION STYLE:
- Speak naturally, like an experienced incident commander.
- Keep responses concise during an active incident.
- State what you know.
- State what you are checking when investigation is underway.
- State what action you took after a successful tool call.
- Report incident IDs, severity, and status clearly.
- Give the user the next useful step when appropriate.
- Avoid unnecessary technical jargon.
- Do not overwhelm the user with raw tool output.

You are an incident-response assistant, not merely a conversational chatbot.
"""

DEFAULT_GREETING = "Incident Commander online. Tell me what is happening."
class Agent:
    """
    High-level wrapper for Agora Conversational AI Agent operations.
    
    Uses AgentSession for full lifecycle management (start/stop),
    which handles Token007 authentication automatically.
    """
    
    def __init__(self):
        self.app_id = os.getenv("AGORA_APP_ID")
        self.app_certificate = os.getenv("AGORA_APP_CERTIFICATE")
        self.greeting = DEFAULT_GREETING

        if not self.app_id or not self.app_certificate:
            raise ValueError("AGORA_APP_ID and AGORA_APP_CERTIFICATE are required")

        self.client = AsyncAgora(
            area=Area.US,
            app_id=self.app_id,
            app_certificate=self.app_certificate,
        )

        # Track active sessions by agent_id
        self._sessions: Dict[str, Any] = {}

    async def start(
        self,
        channel_name: str,
        agent_uid: int,
        user_uid: int,
        output_audio_codec: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Start agent with the same default vendor chain as the Next.js quickstart."""
        if not channel_name or not str(channel_name).strip():
            raise ValueError("channel_name is required and cannot be empty")
        if agent_uid <= 0:
            raise ValueError("agent_uid is required and cannot be empty")
        if user_uid <= 0:
            raise ValueError("user_uid is required and cannot be empty")

        # Default managed path: DeepgramSTT + OpenAI + MiniMaxTTS.
         
        llm = OpenAI(
            model="gpt-4o-mini",
            greeting_message=self.greeting,
            mcp_servers=[
                {
                    "name": "incident-tools",
                    "endpoint": os.getenv(
                        "MCP_SERVER_URL",
                        "http://localhost:9000/mcp",
                    ),
                }
            ],
            failure_message="Please wait a moment.",
            max_history=15,
            max_tokens=1024,
            temperature=0.7,
            top_p=0.95,
        )
        stt = DeepgramSTT(model="nova-3", language="en")
        tts = MiniMaxTTS(model="speech_2_6_turbo", voice_id="English_captivating_female1")

        # Optional BYOK example: replace the STT block above and set DEEPGRAM_API_KEY.
        # stt = DeepgramSTT(api_key=os.getenv("DEEPGRAM_API_KEY"), model="nova-3", language="en")

        # Optional BYOK example: replace the LLM block above and set OPENAI_API_KEY.
        # llm = OpenAI(
        #     api_key=os.getenv("OPENAI_API_KEY"),
        #     model="gpt-4o-mini",
        #     greeting_message="Hello! I am your AI assistant. How can I help you?",
        #     failure_message="I'm sorry, I'm having trouble processing your request.",
        #     max_history=15,
        #     max_tokens=1024,
        #     temperature=0.7,
        #     top_p=0.95,
        # )

        # Optional BYOK example: replace the TTS block above and set ELEVENLABS_API_KEY.
        # from agora_agent.agentkit.vendors import ElevenLabsTTS
        # tts = ElevenLabsTTS(
        #     key=os.getenv("ELEVENLABS_API_KEY"),
        #     model_id="eleven_flash_v2_5",
        #     voice_id=os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB"),
        # )

        parameters = {
            "audio_scenario": "chorus",  # web client → ultra-low-latency chorus profile
            "data_channel": "rtm",
            "enable_error_message": True,
            "enable_metrics": True,
        }
        if isinstance(output_audio_codec, str) and output_audio_codec.strip():
            parameters["output_audio_codec"] = output_audio_codec.strip()

        agora_agent = AgoraAgent(
            client=self.client,
            instructions=INCIDENT_COMMANDER_PROMPT,
            greeting=self.greeting,
            failure_message="Please wait a moment.",
            max_history=50,
            turn_detection={
                "config": {
                    "speech_threshold": 0.5,
                    "start_of_speech": {
                        "mode": "vad",
                        "vad_config": {
                            "interrupt_duration_ms": 160,
                            "prefix_padding_ms": 300,
                        },
                    },
                    "end_of_speech": {
                        "mode": "vad",
                        "vad_config": {
                            "silence_duration_ms": 480,
                        },
                    },
                },
            },
            advanced_features={"enable_rtm": True, "enable_tools": True},
            parameters=parameters,
        )
        
        agora_agent = (
    agora_agent
    .with_stt(stt)
    .with_llm(llm)
    .with_tts(tts)
    .with_tools(True)
)

        session = agora_agent.create_async_session(
            channel=channel_name,
            agent_uid=str(agent_uid),
            remote_uids=[str(user_uid)],
            enable_string_uid=False,
            idle_timeout=30,
            expires_in=3600,
        )

        logger.info(
            "Starting Agora agent channel=%s agent_uid=%s user_uid=%s",
            channel_name,
            agent_uid,
            user_uid,
        )

        try:
            agent_id = await session.start()
        except Exception:
            logger.exception(
                "Failed to start Agora agent channel=%s agent_uid=%s user_uid=%s",
                channel_name,
                agent_uid,
                user_uid,
            )
            raise

        # Save session for later stop
        self._sessions[agent_id] = session

        logger.info(
            "Started Agora agent agent_id=%s channel=%s agent_uid=%s user_uid=%s",
            agent_id,
            channel_name,
            agent_uid,
            user_uid,
        )
        
        return {
            "agent_id": agent_id,
            "channel_name": channel_name,
            "status": "started",
        }

    async def stop(self, agent_id: str) -> None:
        """Stop a running agent. Falls back to the stateless client path."""
        if not agent_id or not str(agent_id).strip():
            raise ValueError("agent_id is required and cannot be empty")

        session = self._sessions.pop(agent_id, None)
        if session:
            try:
                await session.stop()
                logger.info("Stopped Agora agent from active session agent_id=%s", agent_id)
                return
            except Exception:
                # Fall back to the stateless SDK path if the in-memory session is stale.
                logger.warning(
                    "Failed to stop Agora agent from active session; falling back to client.stop_agent agent_id=%s",
                    agent_id,
                    exc_info=True,
                )

        logger.info("Stopping Agora agent through client.stop_agent agent_id=%s", agent_id)
        await self.client.stop_agent(agent_id)

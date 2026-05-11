from fastapi import HTTPException, status

# Role constants
ROLE_DISPATCHER  = "dispatcher"
ROLE_MANAGER     = "manager"
ROLE_ENGINEER    = "engineer"          # ← replaces ROLE_engineer
ROLE_AUDITOR     = "auditor"
ROLE_ADMIN       = "admin"
ROLE_AGENT       = "agent.call"

ALL_HUMAN_ROLES  = {ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ENGINEER, ROLE_AUDITOR, ROLE_ADMIN}
ALL_AGENT_ROLES  = {ROLE_AGENT}


import os
from dotenv import load_dotenv
load_dotenv()

KNOWN_AGENT_CLIENT_IDS: set[str] = {
    v for k, v in os.environ.items()
    if k.startswith("AGENT") and k.endswith("_CLIENT_ID") and v
}

# Maps each endpoint to the set of roles that can call it.
PERMISSIONS: dict[str, set[str]] = {
    # Scan
    "run_predictive_scan":  {ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ADMIN, ROLE_AGENT},

    # Dispatcher triage
    "triage_decision":      {ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ADMIN},

    # Manager second review
    "manager_decision":     {ROLE_MANAGER, ROLE_ADMIN},

    # Engineer workbench
    "engineer_jobs":        {ROLE_ENGINEER, ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ADMIN},
    "engineer_job_start":   {ROLE_ENGINEER, ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ADMIN},
    "engineer_job_complete":{ROLE_ENGINEER, ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ADMIN},

    # SOP guidance
    "sop_chat":             {ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ENGINEER, ROLE_ADMIN, ROLE_AGENT},
    "agent3_retrieve":      {ROLE_AGENT, ROLE_ADMIN},
    "agent4_chat":          {ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ENGINEER, ROLE_ADMIN, ROLE_AGENT},

    # Audit
    "generate_audit":       {ROLE_MANAGER, ROLE_AUDITOR, ROLE_ADMIN, ROLE_AGENT},
    "generate_handover":    {ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ADMIN, ROLE_AGENT},

    # Session state
    "session_state":        ALL_HUMAN_ROLES | ALL_AGENT_ROLES,
    "session_complete":     ALL_HUMAN_ROLES | ALL_AGENT_ROLES,

    # Identity
    "get_me":               ALL_HUMAN_ROLES | ALL_AGENT_ROLES,
    "health":               ALL_HUMAN_ROLES | ALL_AGENT_ROLES,
}


def check_permission(user: dict, endpoint: str) -> None:
    """
    Raises HTTP 403 if the user's role is not in the endpoint's allowed roles.
    Call this at the start of any protected route.
    """
    role    = user.get("role", "")
    allowed = PERMISSIONS.get(endpoint, set())

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Endpoint '{endpoint}' has no permissions configured.",
        )

    if role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{role}' does not have access to this endpoint. "
                   f"Required: one of {sorted(allowed)}",
        )

    # Extra check for agent.call — must come from a known agent client ID
    if role == ROLE_AGENT:
        client_id = user.get("client_id", "")
        if KNOWN_AGENT_CLIENT_IDS and client_id not in KNOWN_AGENT_CLIENT_IDS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Agent client ID '{client_id}' is not a registered agent service principal.",
            )


def require_role(*roles: str):
    from fastapi import Depends
    from auth import get_current_user

    async def _check(user: dict = Depends(get_current_user)):
        role = user.get("role", "")
        if role not in set(roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' does not have access. Required: one of {sorted(roles)}",
            )
        return user

    return _check


def is_admin(user: dict)       -> bool: return user.get("role") == ROLE_ADMIN
def is_manager(user: dict)     -> bool: return user.get("role") in (ROLE_MANAGER, ROLE_ADMIN)
def is_dispatcher(user: dict)  -> bool: return user.get("role") in (ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ADMIN)
def is_engineer(user: dict)    -> bool: return user.get("role") in (ROLE_ENGINEER, ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ADMIN)
def is_auditor(user: dict)     -> bool: return user.get("role") in (ROLE_AUDITOR, ROLE_MANAGER, ROLE_ADMIN)
def is_agent(user: dict)       -> bool: return user.get("role") == ROLE_AGENT
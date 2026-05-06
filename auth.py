

import os
import httpx
from functools import lru_cache
from fastapi import Request, HTTPException, status
from dotenv import load_dotenv


load_dotenv()

TENANT_ID  = os.getenv("ENTRA_TENANT_ID")
CLIENT_ID  = os.getenv("ENTRA_CLIENT_ID")
AUDIENCE   = os.getenv("ENTRA_AUDIENCE",   f"api://{os.getenv('ENTRA_CLIENT_ID','9b1ff49f-dd34-4443-adaa-55e55c767e9b')}")
BYPASS     = os.getenv("DEV_AUTH_BYPASS",  "true").lower() == "true"

JWKS_URL   = f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys"
ISSUER     = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"


# Dev user (used when DEV_AUTH_BYPASS=true) 
def _dev_user() -> dict:
    return {
        "id":        os.getenv("DEV_USER_ID",    "demo-dispatcher-001"),
        "name":      os.getenv("DEV_USER_NAME",  "Demo Dispatcher"),
        "email":     os.getenv("DEV_USER_EMAIL", "dispatcher@lavenir.com"),
        "role":      os.getenv("DEV_USER_ROLE",  "dispatcher"),
        "client_id": "",
    }


@lru_cache(maxsize=1)
def _get_jwks() -> dict:
    resp = httpx.get(JWKS_URL, timeout=10)
    resp.raise_for_status()
    return resp.json()



def _validate_jwt(token: str) -> dict:
    """
    Validates an Entra ID JWT and returns the decoded claims.
    Raises HTTP 401 on any validation failure.
    """
    try:
        from jose import jwt, JWTError, jwk
        from jose.utils import base64url_decode
        import json

        # Get signing keys
        jwks = _get_jwks()

        # Decode header to find key ID
        header = jwt.get_unverified_header(token)
        kid    = header.get("kid")

        # Find matching key
        key = next(
            (k for k in jwks.get("keys", []) if k.get("kid") == kid),
            None
        )
        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="JWT signing key not found in JWKS",
            )

        # Validate and decode
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=AUDIENCE,
            issuer=ISSUER,
        )
        return claims

    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="python-jose not installed. Run: pip install python-jose[cryptography]",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _extract_user(claims: dict) -> dict:
    """
    Extracts the user identity dict from validated JWT claims.

    Claim mappings:
      oid   → user ID (stable Azure AD object ID)
      name  → display name
      upn / preferred_username → email
      roles → list of app roles (we take the first one)
      azp   → authorised party (client ID) — present for agent SPs
    """
    roles = claims.get("roles", [])
    role  = roles[0] if roles else ""

    return {
        "id":        claims.get("oid", ""),
        "name":      claims.get("name", claims.get("preferred_username", "Unknown")),
        "email":     claims.get("upn", claims.get("preferred_username", "")),
        "role":      role,
        "client_id": claims.get("azp", ""),   # set for SP tokens, empty for user tokens
    }


# Main dependency 
async def get_current_user(request: Request) -> dict:
 
    if BYPASS:
        return _dev_user()

    # Extract Bearer token
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header. Expected: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token  = auth_header[7:]  # strip "Bearer "
    claims = _validate_jwt(token)
    user   = _extract_user(claims)

    if not user.get("role"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No app role assigned to this user. "
                   "Ask your administrator to assign a role in Azure AD → Enterprise applications → lavenir-fabric-sp → Users and groups.",
        )

    return user


# Convenience helpers
def is_manager(user: dict)    -> bool: return user.get("role") in ("manager", "admin")
def is_dispatcher(user: dict) -> bool: return user.get("role") in ("dispatcher", "manager", "admin")
def is_agent(user: dict)      -> bool: return user.get("role") == "agent.call"
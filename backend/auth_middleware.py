"""JWT authentication dependency for FastAPI (shared secret with auth-api)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Optional

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import get_settings

_bearer = HTTPBearer(auto_error=False)


@dataclass
class AuthUser:
    user_id: int
    email: str
    account_id: int
    role_id: int
    role_slug: str
    privileges: list[str]


def _decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Access token expired.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid access token.")

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type.")

    return payload


def get_current_user(
    request: Request,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(_bearer)],
) -> AuthUser:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Authentication required.")

    payload = _decode_access_token(credentials.credentials)

    try:
        user = AuthUser(
            user_id=int(payload["sub"]),
            email=str(payload["email"]),
            account_id=int(payload["accountId"]),
            role_id=int(payload["roleId"]),
            role_slug=str(payload.get("roleSlug", "")),
            privileges=list(payload.get("privileges") or []),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Malformed access token.") from exc

    request.state.auth_user = user
    return user


def require_privilege(*required: str):
    def _checker(user: Annotated[AuthUser, Depends(get_current_user)]) -> AuthUser:
        if "platform_admin" in user.privileges:
            return user
        missing = [p for p in required if p not in user.privileges]
        if missing:
            raise HTTPException(
                status_code=403,
                detail={"error": "Insufficient permissions.", "required": missing},
            )
        return user

    return _checker

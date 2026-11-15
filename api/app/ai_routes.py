"""Optional AI routes; include ``router`` in the FastAPI application."""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ai import assistant, gazetteer, intent, narrate
from .real import _cutoff, _envelope

router = APIRouter()


class ResolveRequest(BaseModel):
    text: str = Field(min_length=1)
    lang: Literal['es', 'en', 'pt'] | None = None


class DescribeRequest(BaseModel):
    kind: Literal['calendar', 'chart']
    payload: dict
    lang: Literal['es', 'en', 'pt'] = 'es'
    profile: Literal['brigadista', 'cientifico'] = 'brigadista'


@router.post('/resolve-area')
def resolve_area(request: ResolveRequest):
    parsed = intent.extract(request.text)
    if request.lang:
        parsed['lang'] = request.lang
    result = gazetteer.resolve(parsed['place_text'])
    return _envelope(_cutoff(), intent=parsed, **result, source=parsed['source'])


@router.post('/describe')
def describe(request: DescribeRequest):
    return {'text': narrate.describe(request.kind, request.payload, request.lang, request.profile)}


class ChatTurn(BaseModel):
    role: Literal['user', 'assistant']
    text: str = Field(default='', max_length=4000)


class ChatContext(BaseModel):
    place: str | None = Field(default=None, max_length=300)
    period: str | None = Field(default=None, max_length=80)
    summary: str | None = Field(default=None, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    profile: Literal['curioso', 'brigadista', 'cientifico'] = 'curioso'
    lang: Literal['es', 'en', 'pt'] = 'es'
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)
    context: ChatContext = Field(default_factory=ChatContext)


@router.post('/assistant/reply')
def assistant_reply(request: ChatRequest):
    """Gotita's conversational turn: "data" (the app queries the series with `query`) or "answer" (a reply in the
    profile's voice that only repeats figures already shown). Figures never come from the model."""
    out = assistant.reply(request.message, request.profile, request.lang,
                          [t.model_dump() for t in request.history], request.context.model_dump())
    return {"attribution": "NASA FIRMS", **out}

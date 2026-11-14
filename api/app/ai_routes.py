"""Optional AI routes; include ``router`` in the FastAPI application."""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ai import gazetteer, intent, narrate
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

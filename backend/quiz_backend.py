# quiz_backend.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import uuid
from datetime import datetime, timezone

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for demo only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage
# quizzes[quiz_id] = {
#   title, questions: [{question, options, answer(index)}], timer: seconds,
#   started_at: ISO str or None, adjustment: int (seconds)
# }
quizzes: Dict[str, Dict[str, Any]] = {}
leaderboards: Dict[str, List[Dict[str, Any]]] = {}


# Models
class QuestionInput(BaseModel):
    question: str
    options: List[str]
    answer: int  # index


class QuizCreate(BaseModel):
    title: str
    questions: Optional[List[QuestionInput]] = []
    timer: Optional[int] = 0  # seconds


class ScoreEntry(BaseModel):
    name: str
    score: int


# Helpers
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s)


def compute_time_left(quiz: Dict[str, Any]) -> int:
    """
    Compute remaining time in seconds.
    time_left = timer + adjustment - elapsed_since_started
    If not started, return quiz['timer'] + adjustment (but not negative).
    """
    base = quiz.get("timer", 0)
    adj = quiz.get("adjustment", 0)
    started_at = quiz.get("started_at")
    if not started_at:
        return max(0, int(base + adj))
    try:
        started = parse_iso(started_at)
    except Exception:
        # fallback
        started = datetime.now(timezone.utc)
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    remaining = int(base + adj - elapsed)
    if remaining < 0:
        remaining = 0
    return remaining


# Routes

@app.post("/quizzes")
def create_quiz(payload: QuizCreate):
    quiz_id = str(uuid.uuid4())[:8]
    quizzes[quiz_id] = {
        "title": payload.title,
        "questions": [q.dict() for q in (payload.questions or [])],
        "timer": payload.timer or 0,
        "started_at": None,     # ISO string when started
        "adjustment": 0,        # seconds added/removed by admin after start (or before)
    }
    leaderboards[quiz_id] = []
    return {"quiz_id": quiz_id}


@app.get("/quizzes/{quiz_id}")
def get_quiz_admin(quiz_id: str):
    """Admin view returns full quiz (including questions)."""
    if quiz_id not in quizzes:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quizzes[quiz_id]


@app.get("/quizzes/{quiz_id}/status")
def get_quiz_status(quiz_id: str):
    """
    Participant-friendly status.
    Returns: { quiz_id, title, started: bool, time_left: int, questions: [] if started else [] }
    """
    if quiz_id not in quizzes:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz = quizzes[quiz_id]
    started = bool(quiz.get("started_at"))
    time_left = compute_time_left(quiz)
    # if started -> include questions, else hide them
    questions = quiz["questions"] if started else []
    return {
        "quiz_id": quiz_id,
        "title": quiz["title"],
        "started": started,
        "time_left": time_left,
        "questions": questions,
    }


@app.post("/questions/{quiz_id}")
def add_question(quiz_id: str, q: QuestionInput):
    if quiz_id not in quizzes:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quizzes[quiz_id]["questions"].append(q.dict())
    return {"message": "Question added", "total_questions": len(quizzes[quiz_id]["questions"])}


@app.post("/quizzes/{quiz_id}/start")
def start_quiz(quiz_id: str):
    """
    Admin starts the quiz: set started_at if not already set.
    If already started, returns current time_left.
    """
    if quiz_id not in quizzes:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz = quizzes[quiz_id]
    if not quiz.get("started_at"):
        quiz["started_at"] = now_iso()
    time_left = compute_time_left(quiz)
    return {"message": "started", "time_left": time_left}


@app.post("/quizzes/{quiz_id}/adjust")
def adjust_quiz_timer(quiz_id: str, payload: Dict[str, int]):
    """
    Admin adjusts timer.
    payload: {"delta": 20} or {"delta": -20}
    If quiz not started -> modify base timer
    If started -> modify adjustment (affects remaining time)
    """
    if quiz_id not in quizzes:
        raise HTTPException(status_code=404, detail="Quiz not found")
    delta = int(payload.get("delta", 0))
    quiz = quizzes[quiz_id]
    if not quiz.get("started_at"):
        # adjust base timer
        quiz["timer"] = max(0, int(quiz.get("timer", 0) + delta))
    else:
        # adjust running quiz (change adjustment)
        quiz["adjustment"] = int(quiz.get("adjustment", 0) + delta)
    time_left = compute_time_left(quiz)
    return {"message": "adjusted", "time_left": time_left}


@app.post("/score/{quiz_id}")
def submit_score(quiz_id: str, entry: ScoreEntry):
    if quiz_id not in quizzes:
        raise HTTPException(status_code=404, detail="Quiz not found")
    leaderboards[quiz_id].append(entry.dict())
    leaderboards[quiz_id] = sorted(leaderboards[quiz_id], key=lambda x: x["score"], reverse=True)
    return {"message": "Score submitted", "leaderboard": leaderboards[quiz_id]}


@app.get("/leaderboard/{quiz_id}")
def get_leaderboard(quiz_id: str):
    if quiz_id not in leaderboards:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return leaderboards[quiz_id]

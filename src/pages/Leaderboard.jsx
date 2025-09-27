"use client"

import { useEffect, useState } from "react"
import { useUser } from "../context/UserContext"
import { mockLeaderboard } from "../data/mockData"
import LeaderboardTable from "../components/LeaderboardTable"
import { Link } from "react-router-dom"
import "./Leaderboard.css"

const API_ROOT = "http://localhost:8000" // change to your deployed URL when ready

// helper to convert xp -> numeric level
function calcLevelFromXP(xp = 0) {
  return Math.max(1, Math.floor(xp / 100) + 1)
}

function Leaderboard() {
  const { user } = useUser()

  const [leaderboard, setLeaderboard] = useState([]) // array of rows
  const [userRank, setUserRank] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchLeaderboard()
    // optional: refresh interval
    // const id = setInterval(fetchLeaderboard, 30000)
    // return () => clearInterval(id)
  }, [])

  async function fetchLeaderboard() {
    setLoading(true)
    setError(null)
    try {
      const q = new URL(`${API_ROOT}/api/leaderboard`)
      q.searchParams.append("limit", 50)
      if (user && (user.id || user.userId)) q.searchParams.append("userId", user.id || user.userId)

      const res = await fetch(q.toString())
      if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`)
      const json = await res.json()

      const mapped = (json.top || []).map((u, idx) => {
        const xp = Number(u.total_xp ?? u.xp ?? 0) || 0
        const levelNum = calcLevelFromXP(xp)
        return {
          id: u._id || u.id || `user_${idx}`,   // React key
          name: u.displayName || u.username || `Player ${idx + 1}`,
          level: levelNum,                       // numeric level
          xp: xp,
          avatarUrl: u.avatarUrl || null,
          username: u.username || null,
          userId: u._id || u.id || null
        }
      })

      setLeaderboard(mapped)
      setUserRank(json.user_rank ?? null)
    } catch (err) {
      console.error("Failed to load leaderboard:", err)
      setError(err.message || "Failed to load leaderboard")

      // fallback: ensure level is numeric here too
      const fallback = mockLeaderboard.map((p, i) => ({
        id: p.userId || `fallback_${i}`,
        name: p.name || p.displayName || p.username,
        username: p.username || null,
        displayName: p.displayName || null,
        level: typeof p.level === "number" ? p.level : calcLevelFromXP(p.xp || 0),
        xp: p.xp || 0,
        avatarUrl: p.avatarUrl || null,
        userId: p.userId || null
      }))
      setLeaderboard(fallback)
      setUserRank(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="leaderboard-page">
      <div className="container">
        {/* Page Header */}
        <div className="leaderboard-header">
          <div className="header-content">
            <h1 className="page-title">Global Leaderboard</h1>
            <p className="page-subtitle">See how you rank against the best learners in Solo Leveling Academy</p>
          </div>
          {user.isAuthenticated && (
            <div className="header-actions">
              <Link to="/practice" className="btn btn-primary">
                Earn More XP
                <span className="btn-icon">⚡</span>
              </Link>
            </div>
          )}
        </div>

        {loading && <p style={{ color: "#94a3b8" }}>Loading leaderboard…</p>}
        {error && <p style={{ color: "#f87171" }}>Error: {error}. Showing demo data.</p>}

        {/* User's Current Rank */}
        {user.isAuthenticated && (
          <div className="current-rank-card glass-card">
            <div className="rank-info">
              <div className="rank-details">
                <h3 className="rank-title">Your Current Standing</h3>
                <div className="rank-stats">
                  <div className="rank-stat">
                    <span className="stat-label">Level</span>
                    <span className="stat-value">Lv.{user.level}</span>
                  </div>
                  <div className="rank-stat">
                    <span className="stat-label">XP</span>
                    <span className="stat-value">{user.xp.toLocaleString()}</span>
                  </div>
                  <div className="rank-stat">
                    <span className="stat-label">Rank</span>
                    <span className="stat-value">
                      {userRank && userRank.rank ? `#${userRank.rank}` : "Unranked"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rank-motivation">
                <p className="motivation-text">
                  {user.xp < 100 ? "Keep practicing to climb the ranks!" :
                   user.xp < 500 ? "You're making great progress!" :
                   user.xp < 1000 ? "You're becoming a strong learner!" :
                   "You're among the elite learners!"}
                </p>
                <Link to="/practice" className="btn btn-secondary btn-sm">Practice Now</Link>
              </div>
            </div>
          </div>
        )}

        <LeaderboardTable leaderboardData={leaderboard} />

        {!user.isAuthenticated && (
          <div className="cta-section">
            <div className="cta-card glass-card">
              <div className="cta-content">
                <h3 className="cta-title">Ready to Join the Competition?</h3>
                <p className="cta-description">Start your learning journey and see your name climb up the leaderboard. Every question answered gets you closer to the top!</p>
                <div className="cta-actions">
                  <Link to="/login" className="btn btn-primary">Start Learning</Link>
                  <Link to="/" className="btn btn-secondary">Learn More</Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info cards */}
        <div className="leaderboard-info">
          <div className="info-grid">
            <div className="info-card glass-card">
              <div className="info-icon">🏆</div>
              <h4 className="info-title">Monthly Reset</h4>
              <p className="info-description">Leaderboard resets every month to give everyone a fresh start.</p>
            </div>
            <div className="info-card glass-card">
              <div className="info-icon">⚡</div>
              <h4 className="info-title">Earn XP</h4>
              <p className="info-description">Answer questions correctly and complete daily tasks to earn XP.</p>
            </div>
            <div className="info-card glass-card">
              <div className="info-icon">🎯</div>
              <h4 className="info-title">Fair Play</h4>
              <p className="info-description">All rankings are based on legitimate learning progress and achievements.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Leaderboard

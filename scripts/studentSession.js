/**
 * Student Session Manager
 * Manages student identification and session data
 */

const SESSION_STORAGE_KEY = 'module2_student_session';
const SESSION_DURATION_HOURS = 8;
const MILLISECONDS_PER_HOUR = 3600000;

class StudentSession {
    constructor() {
        this.currentSession = null;
    }

    hasActiveSession() {
        this.loadSession();

        if (!this.currentSession) {
            return false;
        }

        return !this.isSessionExpired();
    }

    isSessionExpired() {
        if (!this.currentSession?.sessionStartTime) {
            return true;
        }

        const elapsed = Date.now() - this.currentSession.sessionStartTime;
        const maxDuration = SESSION_DURATION_HOURS * MILLISECONDS_PER_HOUR;

        return elapsed > maxDuration;
    }

    createSession(studentName, photoDataUrl) {
        this.currentSession = {
            name: studentName,
            photoDataUrl: photoDataUrl,
            sessionStartTime: Date.now(),
            sessionId: this.generateSessionId()
        };

        this.saveSession();
        return this.currentSession;
    }

    getSession() {
        this.loadSession();
        return this.currentSession;
    }

    clearSession() {
        this.currentSession = null;
        localStorage.removeItem(SESSION_STORAGE_KEY);
    }

    saveSession() {
        if (this.currentSession) {
            localStorage.setItem(
                SESSION_STORAGE_KEY,
                JSON.stringify(this.currentSession)
            );
        }
    }

    loadSession() {
        try {
            const data = localStorage.getItem(SESSION_STORAGE_KEY);
            if (data) {
                this.currentSession = JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading session:', error);
            this.currentSession = null;
        }
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getStudentName() {
        return this.currentSession?.name || 'Unknown Student';
    }

    getSessionDuration() {
        if (!this.currentSession?.sessionStartTime) {
            return 0;
        }
        return Date.now() - this.currentSession.sessionStartTime;
    }

    formatSessionDuration() {
        const duration = this.getSessionDuration();
        const hours = Math.floor(duration / MILLISECONDS_PER_HOUR);
        const minutes = Math.floor((duration % MILLISECONDS_PER_HOUR) / 60000);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }
}

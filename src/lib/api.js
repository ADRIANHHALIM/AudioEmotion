/**
 * API Client for AudioEmotion Backend
 */

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3002/api";

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = "ApiError";
  }
}

// Token storage
let authToken = localStorage.getItem("authToken");

/**
 * Set authentication token
 */
export const setAuthToken = (token) => {
  authToken = token;
  if (token) {
    localStorage.setItem("authToken", token);
  } else {
    localStorage.removeItem("authToken");
  }
};

/**
 * Get current auth token
 */
export const getAuthToken = () => authToken;

/**
 * Clear auth token (logout)
 */
export const clearAuthToken = () => {
  authToken = null;
  localStorage.removeItem("authToken");
};

/**
 * Make API request
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const config = {
    ...options,
    headers,
  };

  if (options.body && typeof options.body === "object") {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.message || "Request failed",
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || "Network error", 0, null);
  }
}

// ==================== Auth API ====================

export const authApi = {
  signUp: async (email, password, name) => {
    const data = await request("/auth/signup", {
      method: "POST",
      body: { email, password, name },
    });
    setAuthToken(data.token);
    return data;
  },

  signIn: async (email, password) => {
    const data = await request("/auth/signin", {
      method: "POST",
      body: { email, password },
    });
    setAuthToken(data.token);
    return data;
  },

  getMe: async () => {
    return request("/auth/me");
  },

  refresh: async () => {
    const data = await request("/auth/refresh", { method: "POST" });
    setAuthToken(data.token);
    return data;
  },

  changePassword: async (currentPassword, newPassword) => {
    return request("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
  },

  signOut: () => {
    clearAuthToken();
  },
};

// ==================== Sessions API ====================

export const sessionsApi = {
  getAll: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sessions${query ? `?${query}` : ""}`);
  },

  getById: async (id) => {
    return request(`/sessions/${id}`);
  },

  create: async (data = {}) => {
    return request("/sessions", {
      method: "POST",
      body: data,
    });
  },

  update: async (id, data) => {
    return request(`/sessions/${id}`, {
      method: "PATCH",
      body: data,
    });
  },

  end: async (id) => {
    return request(`/sessions/${id}/end`, {
      method: "POST",
    });
  },

  delete: async (id) => {
    return request(`/sessions/${id}`, {
      method: "DELETE",
    });
  },
};

// ==================== Predictions API ====================

export const predictionsApi = {
  create: async (prediction) => {
    return request("/predictions", {
      method: "POST",
      body: prediction,
    });
  },

  createBatch: async (sessionId, predictions) => {
    return request("/predictions/batch", {
      method: "POST",
      body: { sessionId, predictions },
    });
  },

  getBySession: async (sessionId) => {
    return request(`/predictions/session/${sessionId}`);
  },

  getRecent: async (limit = 100) => {
    return request(`/predictions/recent?limit=${limit}`);
  },

  delete: async (id) => {
    return request(`/predictions/${id}`, {
      method: "DELETE",
    });
  },
};

// ==================== Users API ====================

export const usersApi = {
  getProfile: async () => {
    return request("/users/profile");
  },

  updateProfile: async (data) => {
    return request("/users/profile", {
      method: "PATCH",
      body: data,
    });
  },

  getSettings: async () => {
    return request("/users/settings");
  },

  updateSettings: async (data) => {
    return request("/users/settings", {
      method: "PATCH",
      body: data,
    });
  },

  deleteAccount: async () => {
    return request("/users/account", {
      method: "DELETE",
    });
  },
};

// ==================== Tags API ====================

export const tagsApi = {
  getAll: async () => {
    return request("/tags");
  },

  create: async (name, color) => {
    return request("/tags", {
      method: "POST",
      body: { name, color },
    });
  },

  update: async (id, data) => {
    return request(`/tags/${id}`, {
      method: "PATCH",
      body: data,
    });
  },

  delete: async (id) => {
    return request(`/tags/${id}`, {
      method: "DELETE",
    });
  },
};

// ==================== Stats API ====================

export const statsApi = {
  getOverview: async () => {
    return request("/stats/overview");
  },

  getEmotions: async (days = 30) => {
    return request(`/stats/emotions?days=${days}`);
  },

  getSessions: async (days = 30) => {
    return request(`/stats/sessions?days=${days}`);
  },

  getTrends: async (weeks = 4) => {
    return request(`/stats/trends?weeks=${weeks}`);
  },
};

// Default export with all APIs
export default {
  auth: authApi,
  sessions: sessionsApi,
  predictions: predictionsApi,
  users: usersApi,
  tags: tagsApi,
  stats: statsApi,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
};

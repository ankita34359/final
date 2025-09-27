import axios from "axios";

// Get the backend base URL from Vite's environment variables
const API_BASE = import.meta.env.VITE_API_BASE;

const api = axios.create({
  baseURL: API_BASE, // Backend URL (e.g., http://localhost:5000)
  timeout: 20000, // Timeout after 20 seconds
});

// Function to set Authorization token (if needed)
export const setAuthToken = (token) => {
  if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  else delete api.defaults.headers.common["Authorization"];
};

// API function to call the backend's /infer endpoint
export const getLearningPath = async (userData) => {
  try {
    const response = await api.post("/api/aiml/infer", userData);
    return response.data; // Returns the response from /infer
  } catch (error) {
    console.error("Error fetching learning path:", error);
    throw error;
  }
};

import { useState } from "react";
import { getLearningPath } from "../api/learningPath";

const LearningPathComponent = ({ userToken }) => {
  const [learningPath, setLearningPath] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Ensure the token is passed correctly to set it (if your backend needs it)
  if (userToken) setAuthToken(userToken);

  // The user history data you want to send to the backend
  const userData = {
    history: [
      { question_id: "Ph_Mec_11_3", correct: 1 },
      { question_id: "Ch_Phys_11_7", correct: 0 }
    ], // Replace with actual user history
    k_recommend: 5 // Number of recommendations to fetch
  };

  const handleGetLearningPath = async () => {
    setLoading(true);
    setError(null); // Reset any previous error

    try {
      // Call the backend to get the learning path
      const data = await getLearningPath(userData);
      setLearningPath(data); // Save the recommendations in state
    } catch (err) {
      setError("Failed to get learning path"); // Display an error if the call fails
    } finally {
      setLoading(false); // Set loading to false once the call is complete
    }
  };

  return (
    <div>
      <button onClick={handleGetLearningPath} disabled={loading}>
        {loading ? "Loading..." : "Get Learning Path"}
      </button>

      {error && <p>{error}</p>}

      {learningPath && (
        <div>
          <h3>Recommended Learning Path:</h3>
          <ul>
            {learningPath.recommendations.map((rec, index) => (
              <li key={index}>
                <strong>{rec.question_id}</strong>: {rec.predicted_prob} - {rec.chapter}
              </li>
            ))}
          </ul>
          {/* You can also display other parts of the response (like mastery per chapter) */}
        </div>
      )}
    </div>
  );
};

export default LearningPathComponent;

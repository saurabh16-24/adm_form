// Actual frontend API interaction to our Node.js + Postgres server
const dbConnection = {
    testConnection: async function() {
        try {
            const response = await fetch('/api/test-db');
            if (response.ok) {
                const data = await response.json();
                console.log("Database connected successfully:", data);
                return true;
            }
            return false;
        } catch (error) {
            console.error("Test connection failed. Server might be down.", error);
            // We allow form submission even if server is disconnected per the form logic
            // but the submission endpoint will ultimately fail gracefully
            return false;
        }
    },

    submitEnquiry: async function(formData) {
        try {
            const response = await fetch('/api/submit-enquiry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit form to server.');
            }

            const data = await response.json();
            return { data: data, error: null };
        } catch (error) {
            console.error('Submission error:', error);
            return { data: null, error: error.message };
        }
    }
};

# Use official Node.js image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Create database directory if it doesn't exist (for SQLite)
RUN mkdir -p database

# Expose the port from app.js (default 8081)
EXPOSE 8081

# Command to run the application
CMD ["node", "app.js", "8081"]

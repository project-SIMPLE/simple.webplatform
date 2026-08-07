# Use a Node base image
FROM node:22-alpine

# Set the working directory in the container
WORKDIR /app

# Copy React app
COPY . .

# Debug line as env file isn't supported yet...
RUN find /app/src -type f -exec sed -i "s/localhost/0\.0\.0\.0/g" "{}"  \;

# Install dependencies
RUN	npm install

# Expose the port your app runs on
EXPOSE 8000
EXPOSE 8001
EXPOSE 8080

# Start the application
CMD ["npm", "start"]

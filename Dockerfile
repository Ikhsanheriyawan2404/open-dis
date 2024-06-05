# Use the official Node.js image from the Docker Hub, based on Alpine Linux
FROM node:14-alpine

# Create and change to the app directory
WORKDIR /usr
# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the HTTP and UDP ports
EXPOSE 4000
EXPOSE 4000/udp

# Start the application
# Start the application
CMD ["node", "src/dis-udpserver.js"]

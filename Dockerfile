# Base image — Node 20 LTS Alpine (lightweight)
FROM node:20-alpine

# Working directory set karo
WORKDIR /app

# Package files copy karo pehle (layer caching ke liye)
COPY package*.json ./

# Dependencies install karo
RUN npm ci --only=production

# Baaki saara code copy karo
COPY . .

# Uploads folder banao
RUN mkdir -p uploads logs

# Port expose karo
EXPOSE 5000

# Server start karo
CMD ["node", "server.js"]
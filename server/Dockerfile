FROM node:22.16-alpine
WORKDIR /server
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 9090
CMD ["npm", "run", "dev"]
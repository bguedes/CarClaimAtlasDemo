FROM node:22.16-alpine
WORKDIR /server
COPY package*.json ./
#RUN npm install --only=production=false
RUN rm -rf node_modules package-lock.json
RUN npm install --legacy-peer-deps
COPY . .
EXPOSE 9090
CMD ["npm", "run", "dev"]
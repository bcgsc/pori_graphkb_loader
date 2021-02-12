FROM node:10
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
# Bundle app source
COPY . .
CMD [ "node", "bin/load.js" ]

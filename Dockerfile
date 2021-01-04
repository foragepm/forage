FROM node:current

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json /usr/src/app/
RUN npm install --proxy=http://host.docker.internal:8005/ --registry=http://registry.npmjs.org/ --strict-ssl=false --only=production

# Bundle app source
COPY . /usr/src/app

CMD [ "npm", "test" ]

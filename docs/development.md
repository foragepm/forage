# Developing Forest

Build from source on mac:

```shell
git clone https://github.com/forestpm/forest.git
cd forest
npm ci
```

To configure npm to use forest as a proxy:

```shell
npm run config

# or manually set the following in your .npmrc
npm config set registry=http://0.0.0.0:8005/

# restore the defaults with
npm run unconfig
```

To configure go modules to use forest as a proxy, set the following env var in your shell:

```
GOPROXY=http://localhost:8005
```

Start the electon app:

```shell
npm start
```

or compile the electron app into `./dist`:

```shell
npm run pack
```

and link the command line interface:

```shell
npm link
```

Run the tests:

```shell
npm test
```

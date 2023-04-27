# ld-base
Base stuff for Ludum Dare

This is a small game engine, mostly a simplified version of the code from my last Ludum Dare. Includes the following:

- A general game loop
- Basic platformer physics
- Level parsing from gif files
- Code for loading & rendering sprites from Aseprite
- Code for playing sound effects
- Some rough touch controls
- All the configuration for the typescript tooling

![demo.gif](demo.gif)

## How to build things

Install npm, then run

```sh
npm i
npm build
```

## How to run locally

Run the two commands in different terminals:

```sh
npm run watch   # This watches for changes and automatically builds things when files change
npm run reload  # This runs a local web server that automatically refreshes when files change
```

## Usage

Feel free to use these files as a basis for whatever you want! My normal usage will be to heavily edit the code for whatever project I'm using, rather than trying to extend classes or anything like that.

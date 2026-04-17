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

## How to run locally

Run the dev server:

```sh
npm run dev
```

## How to test

Run the screenshot tests:

```sh
npm run test:screenshot
```

If you make intentional visual changes, approve them with:

```sh
npm run test:screenshot:approve
```

## Usage

Feel free to use these files as a basis for whatever you want! My normal usage will be to heavily edit the code for whatever project I'm using, rather than trying to extend classes or anything like that.

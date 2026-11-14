# Audio (not included)

The music and sound effects the live game used are licensed from third parties
and can't be redistributed, so they aren't in this repository. The game runs
without them, silently.

To add sound, drop your own `.ogg` files here with these names:

| File | Used for |
| --- | --- |
| `bgm3.ogg` | Background music by day (`client/src/components/map/MapMusic.ts`) |
| `bgm1.ogg` | Background music by night |
| `rain.ogg` | Rain (`MapWeather.ts`) |
| `waves.ogg`, `gulls.ogg` | Near the coast (`MapSounds.ts`) |
| `birds.ogg` | Open land |
| `crickets.ogg` | Any land |
| `owls.ogg` | Forests |
| `wind.ogg` | Cold lands |
| `thunder.ogg` | Storms |
| `river.ogg` | Rivers |
| `swamp.ogg` | Swamps |

The music loops between sample points set in `MapMusic.ts` (`loop: [start, end]`
at 44.1 kHz); change those to suit your tracks.

The originals, if you want to license them yourself:

- Music: Karugamo BGM Fantasy vol.5 by Karugamo BGM (composed by tobi)
- Ambience: [Ambiences and Perspectives SFX](https://leohpaz.itch.io/ambiences-perspectives-sfx) by Leohpaz

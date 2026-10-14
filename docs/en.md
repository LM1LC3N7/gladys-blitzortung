# Blitzortung lightning

**Unofficial connector, not affiliated with Blitzortung.org.** It brings the
lightning strikes detected by the [Blitzortung.org](https://www.blitzortung.org/)
community network into Gladys: the strikes near your house, the distance and
direction of the nearest one, scene triggers and a storm widget.

> **Not a safety system.** The detection depends on volunteer detectors and
> on an internet feed that can stop at any time; strikes can be missed or
> placed a few kilometres off. Never rely on this integration to protect
> people or equipment: when thunder roars, go indoors.

## The data: private, non-commercial use

The strikes are computed by Blitzortung.org from detectors that volunteers
build, host and pay for. Their data is provided **for private,
non-commercial use only**. This integration therefore:

- keeps **one connection** to the live feed (the one of the map), and opens
  it only while at least one lightning device exists in Gladys;
- never stores, resells or forwards the data: it only counts the strikes
  near your houses, in memory;
- credits **Blitzortung.org** on the widget.

Do not use it in a commercial product. If you like it, consider
[hosting a detector](https://www.blitzortung.org/) to improve the coverage
near you.

## What you get

| Surface                          | Content                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| One device per **located house** | strikes within the radius in the last minutes, distance (km) and bearing (degrees) of the nearest one, its direction (N, NE...), time of the last |
| Scene triggers                   | **lightning within a distance** (5 to 200 km, once per storm), **storm over** (quiet for the chosen time), **storm approaching**                  |
| Scene action                     | **lightning status**: count, nearest distance, direction, minutes since the last strike, storm in progress                                        |
| Dashboard widget                 | **Lightning**: calm, or storm at X km in a direction, with the count, the nearest and the last strike                                             |

## Setup

> **Bandwidth: about 1 GB a day.** Blitzortung.org sends the strikes of the
> whole world to every client: the feed cannot be narrowed to your region.
> As long as a lightning device exists, the integration downloads all of
> them (about 9 KB per second, more during the northern summer) and keeps
> only those near your house. On a metered link (4G box, data cap) or a
> small box, check that this suits you before adding the device; deleting
> the device closes the feed.

1. Set the location of your house in Gladys (**Settings → Houses**) and
   accept the location access when installing the integration.
2. Open **Discovery** and add the "Lightning near …" device of your house.
   The feed opens as soon as a device exists.
3. Optional: change the **radius** (30 km by default, up to 200 km), the
   **counting window** (15 minutes) and the **quiet period** before "storm
   over" (30 minutes).
4. Put the **Lightning** widget on a dashboard and pick the house.

The **Test the feed** button shows the server in use, the number of strikes
per minute worldwide and the situation around each house.

## The states

- **Nearby strikes**: the strikes within the radius during the window.
- **Nearest strike** (km): the closest one of the window. With no strike in
  the window it is the radius itself, so a condition "below 10 km" never
  holds a stale value.
- **Bearing** (degrees from north) and **direction** (N, NE, E... in French
  N, NE, E, SE, S, SO, O, NO): where the nearest strike was; "—" when calm.
- **Last nearby strike**: its time in UTC (ISO 8601).

The states are published every 15 seconds at most.

## Scenes

- **Lightning within a distance**: pick the house and the distance. The
  scene runs at the first strike closer than that distance, once per storm:
  it can run again only after the quiet period without any strike at that
  distance. The integration only sees the strikes inside the radius of the
  configuration: a distance larger than the radius acts as the radius.
  Variables: the distance of the nearest strike, its bearing and direction,
  the count, the time of the strike.
- **Storm over**: no strike within the chosen distance for the quiet period,
  after a "lightning within" of the same distance (unplug, close, notify).
- **Storm approaching**: the window is cut in three thirds; when the nearest
  strike of each third is closer than in the previous one, the storm is
  coming towards the house. Once per storm, with a rough approach speed.

The action **lightning status** gives `count`, `nearest_km`, `direction`,
`minutes_since_last` and `storm` for a message or a condition. The following
actions of the scene find them in their variable list (written
`{{<step>.<action>.<key>}}`, for instance `{{0.0.nearest_km}}` when this
action is the first of the scene).

## How it works

The integration reads the worldwide live feed of Blitzortung.org, the one
of the [live map](https://map.blitzortung.org/): several strikes per
second, each decoded, then dropped unless it falls within the radius of one
of your houses. The feed is worldwide and cannot be narrowed to a region:
it weighs about **1 GB a day** (more during the northern summer), which
matters on a metered connection.

One connection at a time, to `ws1`, `ws7` or `ws8.blitzortung.org`. The
servers close every connection after about 6 minutes: the integration then
moves to the next server after 1 second. When a server fails, the next one
is tried after 5 seconds, then 10, 20... up to 5 minutes. Without any
message for 2 minutes, the connection is considered dead and replaced.

## Troubleshooting

- **"No located house"**: set the location of the house in Gladys, then
  open Discovery again.
- **"The Blitzortung feed is unreachable"**: the servers are run by
  volunteers; the integration retries by itself. The list of servers is in
  the advanced section of the configuration, in case Blitzortung.org
  changes it.
- **No strike although the map shows a storm**: check the radius, and that
  the storm is within it from your house; the coverage of the network
  varies by region.
- Logs: the integration's log level is set with the `LOG_LEVEL` variable.

## Privacy

The location of your houses is used inside the integration to measure the
distance of the strikes and never leaves it: the feed is the same for
everyone, nothing is sent to Blitzortung.org but the subscription message.

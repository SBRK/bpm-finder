const Spotify = require('spotify-web-api-node')
const mm = require('music-metadata')
const _ = require('lodash')
const glob = require('glob-fs')({ gitignore: true })
const Promise = require('bluebird')
const sleep = require('sleep-promise')
const fs = require('fs')
const pathUtil = require('path')
const leven = require('leven')

const config = require('./config')

const s = new Spotify(config.spotify)

const getAccessToken = async () => {
  const data = await s.clientCredentialsGrant()
  const token = _.get(data, ['body', 'access_token'])

  s.setAccessToken(token)
}

const cleanName = s => (
  s
    .replace(/\([^)]\)/gi, '')
    .replace(/\[[^\]]\]/gi, '')
    .replace(/[^A-Za-z 0-9]/gi, '')
    .replace(/ +/gi, ' ')
)

const getBPM = async (artist = '', track = '', album = '') => {
  try {
    const cleanTrack = cleanName(track)
    const cleanArtist = cleanName(_.get(artist.split(','), 0))
    const cleanAlbum = cleanName(album)

    let tracks = []

    let data = await s.searchTracks(`${cleanArtist ? `artist:${cleanArtist}` : ''} ${cleanTrack ? `track:${cleanTrack}` : ''} ${album ? `album:${album}` : ''}`)
    tracks = _.map(
      _.get(data, ['body', 'tracks', 'items']),
      track => _.pick(track, ['id', 'name', 'artists'])
    )

    if (!tracks.length) {
      // No match found, let's try without the album name
      // (Spotify sometimes doesn't have all albums and singles, but might have the track in another one)
      data = await s.searchTracks(`${cleanArtist ? `artist:${cleanArtist}` : ''} ${cleanTrack ? `track:${cleanTrack}` : ''}`)
      tracks = _.map(
        _.get(data, ['body', 'tracks', 'items']),
        track => _.pick(track, ['id', 'name', 'artists'])
      )
    }

    // Sort tracks with leven to have better matches first
    const sortedTracks = _.sortBy(tracks, ({ name }) => leven(track, name))

    if (tracks.length) {
      const audioFeature = await s.getAudioFeaturesForTrack(sortedTracks[0].id)
      return(_.get(audioFeature, ['body', 'tempo']))
    }
  } catch(err) {
    console.error(err)
  }

  return null
}

const updateFile = async path => {
  const metadata = await mm.parseFile(path)
  const tag = metadata.common

  const bpm = await getBPM(tag.artist, tag.title, tag.album)

  if (bpm) {
    // Rename file with the bpm if found
    const filename = `${Math.round(bpm)} - ${tag.artist} - ${tag.title}${pathUtil.extname(path)}`

    try {
      fs.renameSync(path, pathUtil.join(pathUtil.dirname(path), filename))
    } catch (err) {

    }
  }

  console.log({
    ..._.pick(tag, ['title', 'artist']),
    bpm
  })

  // Sleep to avoid reaching quota limit on the Spotify API
  await sleep(500)
}

const getFiles = path => {
  const flacFiles = glob.readdirSync('/**/*.flac', { cwd: path })
  const mp3Files = glob.readdirSync('/**/*.mp3', { cwd: path })

  const files = _.concat(flacFiles, mp3Files)

  console.log(`Found ${files.length} files`)

  return _.map(files, file => `${path}/${file}`)
}

const main = async () => {
  console.log('Getting Spotify access token...')
  try {
    await getAccessToken()
  } catch (err) {
    console.log('Couldn\'t get Spotify token: ', err.message)
    return
  }

  console.log('Got Spotify access token!')

  const path = _.get(config, 'path') || __dirname

  const files = getFiles(path)

  Promise.each(files, updateFile)
}

main()


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

const s = new Spotify(config)

const getAccessToken = async () => {
  const data = await s.clientCredentialsGrant()
  const token = _.get(data, ['body', 'access_token'])

  s.setAccessToken(token)
}

const getBPM = async (artist = '', track = '', album = '') => {
    try {
        const cleanTrack = track
          .replace(/\([^)]\)/gi, '')
          .replace(/\[[^\]]\]/gi, '')
          .replace(/[^A-Za-z 0-9]/gi, '')
          .replace(/ +/gi, ' ')

        const cleanArtist = _.get(artist.split(','), 0)

        let tracks = []

        let data = await s.searchTracks(`${cleanArtist ? `artist:${cleanArtist}` : ''} ${track ? `track:${cleanTrack}` : ''} ${album ? `album:${album}` : ''}`)
        tracks = _.map(
          _.get(data, ['body', 'tracks', 'items']),
          track => _.pick(track, ['id', 'name', 'artists'])
        )

        if (!tracks.length) {
          data = await s.searchTracks(`${cleanArtist ? `artist:${cleanArtist}` : ''} ${track ? `track:${cleanTrack}` : ''}`)
          tracks = _.map(
            _.get(data, ['body', 'tracks', 'items']),
            track => _.pick(track, ['id', 'name', 'artists'])
          )
        }

        const sortedTracks = _.sortBy(tracks, ({ name }) => leven(track, name))

        if (tracks.length) {
            const audioFeature = await s.getAudioFeaturesForTrack(sortedTracks[0].id)
            return(audioFeature.body.tempo)
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

    await sleep(500)
}

const getFiles = path => {
    const files = glob.readdirSync('/**/*.flac', { cwd: path })

    return _.map(files, file => `${path}/${file}`)
}

const main = async () => {
  console.log('getting access token...')
  try {
    await getAccessToken()
  } catch (err) {
    console.log('couldn\'t get token: ', err.message)
    return
  }

  console.log('got access token!')

  const path = 'C:/Users/Benjamin/Downloads/SMLoadr-win-x64_v1.9.4/2018 FLAC'

  const files = getFiles(path)

  Promise.each(files, updateFile)
}

main()


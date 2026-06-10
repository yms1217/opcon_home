/*global kakao*/
import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

export const DivMap = styled.div`
  position: relative;
  overflow: hidden;
  width: auto;
  height: 500px;
}
`

const Location = ({ markers }) => {
  // let markers = [
  //   // 예시 좌표들: (위도, 경도, 타이틀)
  //   { lat: 37.571442, lng: 126.978578, title: '청계천' },
  //   { lat: 37.4977927, lng: 127.0504018, title: '역삼래미안아파트' }
  // ]

  const handleResize = (sidebarClick) => {
    const mapDiv = document.getElementById('map')
    if (!mapDiv) return

    const sidebarWidth =
      document.querySelector('.sideBar').offsetWidth < 240
        ? sidebarClick === true
          ? 0
          : 100
        : sidebarClick === true
          ? 100
          : 0

    //창 크기별로 맵 사이즈로 적절한 사이즈를 기록하고 맞는 수식을 생성
    if (window.innerWidth > 1580) {
      const csize = 950 + (window.innerWidth - 1742) * 0.666 - 10 + sidebarWidth
      mapDiv.style.width = csize + `px`
    } else if (window.innerWidth > 765) {
      const csize = window.innerWidth - 300 + sidebarWidth * 1.6
      mapDiv.style.width = csize + `px`
    } else {
      const csize = window.innerWidth - 50
      mapDiv.style.width = csize + `px`
    }
  }

  useEffect(() => {
    if (markers.length > 0) {
      const centerLat = markers[0]?.lat ?? 37.5665
      const centerLng = markers[0]?.lng ?? 126.978
      var container = document.getElementById('map')
      var options = {
        center: new kakao.maps.LatLng(centerLat, centerLng),
        level: 9
      }

      var map = new window.kakao.maps.Map(container, options)
      markers.forEach((m) => {
        const markerPosition = new window.kakao.maps.LatLng(m.lat, m.lng)

        const marker = new window.kakao.maps.Marker({
          position: markerPosition,
          title: m.title
        })

        marker.setMap(map)
      })
    } else {
      const centerLat = 37.5665
      const centerLng = 126.978
      var container = document.getElementById('map')
      var options = {
        center: new kakao.maps.LatLng(centerLat, centerLng),
        level: 9
      }

      var map = new window.kakao.maps.Map(container, options)
    }

    const eventBtn = document.querySelector('.hideOnMobile')
    eventBtn.addEventListener('click', () => {
      handleResize(true)
    })

    window.addEventListener('resize', handleResize)
    // 초기 1회 호출(렌더 직후 현재 크기 반영이 필요할 때)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [markers])

  return (
    <DivMap>
      <div id="map" style={{ width: '900px', height: '500px', overflow: 'hidden' }}></div>
    </DivMap>
  )
}

export default Location

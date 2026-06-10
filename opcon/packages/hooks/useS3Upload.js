import { useState, useRef } from 'react'
import { artifactApis } from '@repo/apis'
import { uploadMultipartToS3, uploadSingleFileToS3 } from '@repo/utils'
import { useOrganizationStore, useErrorStore } from '@repo/stores'

const CHUNK_SIZE = 1024 * 1024 * 10 // 10MB

export const useS3Upload = () => {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState(null)
  const [uploadId, setUploadId] = useState(null)
  const abortControllerRef = useRef(null)
  const { company } = useOrganizationStore()

  const uploadFile = async (artifactData, artifactFile, manifestFile) => {
    setIsUploading(true)
    setUploadProgress(0)
    setError(null)
    setUploadId(null)

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    const artifactChunkCount = artifactFile ? Math.ceil(artifactFile.size / CHUNK_SIZE) : 0
    const manifestChunkCount = manifestFile ? Math.ceil(manifestFile.size / CHUNK_SIZE) : 0

    try {
      // 1. Request presigned URLs from the backend
      const payload = {
        artifactId: artifactData.id,
        orgId: artifactData.orgId,
        moduleId: artifactData.moduleId,
        files: {
          artifact: {
            chunkCount: artifactChunkCount,
            fileName: artifactFile?.name || ''
          }
        }
      }
      if (manifestFile) {
        payload.fileInfo.manifest = {
          chunkCount: manifestChunkCount,
          fileName: manifestFile?.name || ''
        }
      }
      const presignedRes = await artifactApis.requestUploadUrl(payload)

      const { artifactUrls, artifactUploadId, manifestUrls } = presignedRes.results
      setUploadId(artifactUploadId)

      // 2. Promise array to upload two files in parallel

      if (manifestFile && manifestUrls) {
        await uploadSingleFileToS3({
          file: manifestFile,
          presignedUrl: manifestUrls[0],
          signal,
          onProgress: (progress) => {
            console.log('Manifest progress:', progress)
            setUploadProgress(progress)
          }
        })
      }

      if (artifactFile && artifactUrls) {
        const uploadPromises = []
        let parts = []
        if (artifactFile.size > CHUNK_SIZE) {
          uploadPromises.push(
            uploadMultipartToS3({
              file: artifactFile,
              presignedUrls: artifactUrls,
              chunkSize: CHUNK_SIZE,
              signal,
              onProgress: (progress) => {
                console.log('Artifact progress:', progress)
                setUploadProgress(progress)
              }
            }).then((res) => {
              parts = res
            })
          )
          await Promise.all(uploadPromises)
        } else {
          await uploadSingleFileToS3({
            file: artifactFile,
            presignedUrl: artifactUrls[0],
            signal,
            onProgress: (progress) => {
              console.log('Artifact progress:', progress)
              setUploadProgress(progress)
            }
          })
        }
      }

      // 2-1. Wait for both uploads to complete in parallel

      // 3. Notify backend that upload is complete to assemble S3 parts
      const completeResults = await artifactApis.completeMultipartUpload({
        id: artifactData.id,
        companyId: company.id,
        orgId: artifactData.orgId,
        fileName: artifactFile.name,
        chunkCount: artifactChunkCount
      })
      return completeResults
    } catch (err) {
      if (err.name === 'CanceledError' || err.message === 'canceled') {
        console.log('Upload was canceled by user')
        const cancelError = new Error('Upload Canceled')
        cancelError.code = 'UPLOAD_CANCELED'
        return { error: cancelError }
      }
      console.error('Artifact upload failed:', err)
      setError(err)
      return { error: err }
    } finally {
      setIsUploading(false)
      setUploadId(null)
    }
  }

  const abortUpload = async () => {
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      if (uploadId) {
        await artifactApis.abortMultipartUpload({
          uploadId: uploadId
        })
      }
      setIsUploading(false)
      setUploadId(null)
    } catch (err) {
      console.error('Artifact upload abort failed:', err)
      setError(err)
      setIsUploading(false)
      setUploadId(null)
      throw err
    }
  }

  return {
    uploadFile,
    abortUpload,
    isUploading,
    uploadProgress,
    uploadId,
    error
  }
}


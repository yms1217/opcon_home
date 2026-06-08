import { useState } from 'react'
import { artifactApis } from '@repo/apis'
import { uploadMultipartToS3, uploadSingleFileToS3 } from '@repo/utils'
import { useOrganizationStore } from '@repo/stores'

const CHUNK_SIZE = 1024 * 1024 * 5 // 5MB

export const useS3Upload = () => {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState(null)
  const [uploadId, setUploadId] = useState(null)
  const { company } = useOrganizationStore()

  const uploadFile = async (artifactData, artifactFile, manifestFile) => {
    setIsUploading(true)
    setUploadProgress(0)
    setError(null)
    setUploadId(null)

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
      console.log('Upload URL results:', presignedRes.results)

      const { artifactUrls, artifactUploadId, manifestUrls } = presignedRes.results
      setUploadId(artifactUploadId)

      // 2. Promise array to upload two files in parallel

      if (manifestFile && manifestUrls) {
        await uploadSingleFileToS3({
          file: manifestFile,
          presignedUrl: manifestUrls[0],
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
            presignedUrl: artifactUrl[0],
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
      console.log('completeResults', completeResults)
      return completeResults
    } catch (err) {
      console.error('Artifact upload failed:', err)
      setError(err)
      throw err
    } finally {
      setIsUploading(false)
      setUploadId(null)
    }
  }

  const abortUpload = async () => {
    try {
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


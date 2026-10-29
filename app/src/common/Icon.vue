<template>
  <component :is="icons[name] || icons.file" class="icon" :class="{ 'icon-spin': spin !== false, 'icon-flip-v': flip === 'vertical' }"
    :style="scale ? { fontSize: scale + 'em' } : null" aria-hidden="true" />
</template>

<script>
  import ArrowLeft from '~icons/ph/arrow-left';
  import ArrowRight from '~icons/ph/arrow-right';
  import ArrowUUpLeft from '~icons/ph/arrow-u-up-left';
  import ArrowsClockwise from '~icons/ph/arrows-clockwise';
  import CaretDown from '~icons/ph/caret-down';
  import CaretUp from '~icons/ph/caret-up';
  import Check from '~icons/ph/check';
  import CloudArrowUp from '~icons/ph/cloud-arrow-up';
  import Copy from '~icons/ph/copy';
  import DownloadSimple from '~icons/ph/download-simple';
  import EnvelopeSimple from '~icons/ph/envelope-simple';
  import Eye from '~icons/ph/eye';
  import File from '~icons/ph/file';
  import FileAudio from '~icons/ph/file-audio';
  import FileImage from '~icons/ph/file-image';
  import FilePdf from '~icons/ph/file-pdf';
  import FileText from '~icons/ph/file-text';
  import FileVideo from '~icons/ph/file-video';
  import FileZip from '~icons/ph/file-zip';
  import Key from '~icons/ph/key';
  import Plus from '~icons/ph/plus';
  import PlusCircle from '~icons/ph/plus-circle';
  import QrCode from '~icons/ph/qr-code';
  import SignIn from '~icons/ph/sign-in';
  import SpinnerGap from '~icons/ph/spinner-gap';
  import Trash from '~icons/ph/trash';
  import UploadSimple from '~icons/ph/upload-simple';
  import UserPlus from '~icons/ph/user-plus';
  import Warning from '~icons/ph/warning';
  import X from '~icons/ph/x';

  // names kept from the Font Awesome set the templates were written with
  const icons = {
    'arrow-left': ArrowLeft,
    'arrow-right': ArrowRight,
    'check': Check,
    'chevron-down': CaretDown,
    'chevron-up': CaretUp,
    'cloud-upload-alt': CloudArrowUp,
    'copy': Copy,
    'download': DownloadSimple,
    'envelope': EnvelopeSimple,
    'exclamation-triangle': Warning,
    'eye': Eye,
    'key': Key,
    'plus': Plus,
    'plus-circle': PlusCircle,
    'qrcode': QrCode,
    'file': File,
    'file-alt': FileText,
    'file-archive': FileZip,
    'file-audio': FileAudio,
    'file-image': FileImage,
    'file-pdf': FilePdf,
    'file-video': FileVideo,
    'sign-in-alt': SignIn,
    'spinner': SpinnerGap,
    'sync-alt': ArrowsClockwise,
    'times': X,
    'trash': Trash,
    'undo-alt': ArrowUUpLeft,
    'upload': UploadSimple,
    'user-plus': UserPlus,
  };

  export default {
    name: 'Icon',
    props: {
      name: { type: String, required: true },
      scale: { type: [String, Number], default: null },
      spin: { type: [Boolean, String], default: false },
      flip: { type: String, default: null },
    },
    data() {
      return { icons };
    },
  };
</script>

<style>
  .icon {
    width: 1.15em;
    height: 1.15em;
    vertical-align: -0.2em;
  }
  .icon-spin {
    animation: icon-spin 1s linear infinite;
  }
  .icon-flip-v {
    transform: scaleY(-1);
  }
  @keyframes icon-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .icon-spin {
      animation-duration: 3s;
    }
  }
</style>
